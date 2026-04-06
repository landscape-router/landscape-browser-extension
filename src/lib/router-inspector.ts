import { getClientCaller } from '@landscape-router/types/api/client/client';
import { getDnsRedirect } from '@landscape-router/types/api/dns-redirects/dns-redirects';
import { getDnsRule } from '@landscape-router/types/api/dns-rules/dns-rules';
import { checkDomain } from '@landscape-router/types/api/dns-service/dns-service';
import { getFlowRuleByFlowId } from '@landscape-router/types/api/flow-rules/flow-rules';
import { traceFlowMatch, traceVerdict } from '@landscape-router/types/api/route/route';
import {
  type DNSRedirectRule,
  type DNSRuleConfig,
  LandscapeDnsRecordType,
  type CallerIdentityResponse,
  type CheckChainDnsResult,
  type FlowConfig,
  type FlowMatchResult,
  type FlowTarget,
  type FlowVerdictResult,
  type LandscapeDnsRecordType as DnsRecordType,
  type LandscapeRecord,
  type RuleSource,
} from '@landscape-router/types/api/schemas';
import type { CurrentSite } from './current-site';
import type { RouterConfig } from './router-storage';
import { getErrorMessage } from './router-client';
import { withRouterClient } from './router-client';

export interface InspectionTarget {
  hostname: string;
  protocol?: string;
  title?: string;
  url?: string;
}

export type SummaryAction =
  | 'direct'
  | 'drop'
  | 'redirect'
  | 'keep_going'
  | 'mixed'
  | 'no-records';

export interface DnsLookupExplanation {
  cacheRecords: LandscapeRecord[];
  dynamicRedirectSource?: string;
  error?: string;
  recordType: DnsRecordType;
  records: LandscapeRecord[];
  redirectDetail?: DnsRedirectDetail;
  redirectId?: string;
  ruleDetail?: DnsRuleDetail;
  ruleId?: string;
}

export interface FlowDetail {
  enabled: boolean;
  flowId: number;
  matchRuleCount: number;
  targetSummary: string;
  targets: string[];
  title: string;
}

export interface DnsRuleDetail {
  action: string;
  enabled: boolean;
  flowId: number;
  id: string;
  index: number;
  sourceSummary: string;
  title: string;
  upstreamId: string;
}

export interface DnsRedirectDetail {
  answerMode: string;
  applyFlowSummary: string;
  enabled: boolean;
  id: string;
  resultSummary: string;
  sourceSummary: string;
  title: string;
}

export interface VerdictExplanation {
  action: Exclude<SummaryAction, 'mixed' | 'no-records'>;
  allowReusePort: boolean;
  cacheConsistent: boolean;
  dnsRulePriority?: number;
  dstIp: string;
  effectiveFlowId: number;
  hasCache: boolean;
  ipRulePriority?: number;
}

export interface SiteInspection {
  client: CallerIdentityResponse;
  dnsLookups: DnsLookupExplanation[];
  flow: FlowMatchResult;
  flowDetails: {
    byIp?: FlowDetail;
    byMac?: FlowDetail;
    effective?: FlowDetail;
  };
  inspectedAt: number;
  summary: {
    action: SummaryAction;
    detail: string;
    label: string;
  };
  target: InspectionTarget;
  verdictError?: string;
  verdicts: VerdictExplanation[];
}

export interface BulkInspectionResult {
  error?: string;
  hostname: string;
  inspection?: SiteInspection;
}

export interface CacheInconsistencySummary {
  cachedVerdictCount: number;
  inconsistentIps: string[];
  inconsistentVerdictCount: number;
}

interface PreparedInspectionContext {
  client: CallerIdentityResponse;
  dnsRedirectCache: Map<string, Promise<DnsRedirectDetail | null>>;
  dnsRuleCache: Map<string, Promise<DnsRuleDetail | null>>;
  flow: FlowMatchResult;
  flowCache: Map<number, Promise<FlowDetail | null>>;
  sourceFields: {
    src_ipv4?: string;
    src_ipv6?: string;
    src_mac?: string | null;
  };
}

function formatFlowTarget(target: FlowTarget): string {
  return target.t === 'netns' ? `netns:${target.container_name}` : target.name;
}

function formatRuleSource(source: RuleSource): string {
  if (source.t === 'config') {
    return `${source.match_type}:${source.value}`;
  }

  const prefix = source.inverse ? 'not ' : '';
  return `${prefix}${source.name}${source.attribute_key ? `/${source.attribute_key}` : ''}`;
}

function formatMarkAction(mark: { action: { t: string }; flow_id: number }): string {
  return mark.action.t === 'redirect' ? `redirect:${mark.flow_id}` : mark.action.t;
}

function summarizeList(items: string[], empty = '-'): string {
  return items.length > 0 ? items.join(', ') : empty;
}

function toFlowDetail(config: FlowConfig): FlowDetail {
  const targets = config.flow_targets.map(formatFlowTarget);

  return {
    enabled: config.enable,
    flowId: config.flow_id,
    matchRuleCount: config.flow_match_rules.length,
    targetSummary: summarizeList(targets),
    targets,
    title: config.remark?.trim() || `Flow ${config.flow_id}`,
  };
}

function toDnsRuleDetail(config: DNSRuleConfig): DnsRuleDetail {
  return {
    action: formatMarkAction(config.mark),
    enabled: config.enable,
    flowId: config.flow_id,
    id: config.id ?? '',
    index: config.index,
    sourceSummary: summarizeList(config.source.map(formatRuleSource)),
    title: config.name?.trim() || config.id || `DNS Rule ${config.index}`,
    upstreamId: config.upstream_id,
  };
}

function toDnsRedirectDetail(config: DNSRedirectRule): DnsRedirectDetail {
  return {
    answerMode: config.answer_mode,
    applyFlowSummary: summarizeList(config.apply_flows.map(String)),
    enabled: config.enable,
    id: config.id ?? '',
    resultSummary: summarizeList(config.result_info),
    sourceSummary: summarizeList(config.match_rules.map(formatRuleSource)),
    title: config.remark?.trim() || config.id || 'DNS Redirect',
  };
}

function getSourceFields(client: CallerIdentityResponse): {
  src_ipv4?: string;
  src_ipv6?: string;
  src_mac?: string | null;
} {
  return {
    src_ipv4: client.ip_version === 'ipv4' ? client.ip : undefined,
    src_ipv6: client.ip_version === 'ipv6' ? client.ip : undefined,
    src_mac: client.mac ?? null,
  };
}

function toLookupExplanation(
  recordType: DnsRecordType,
  result: CheckChainDnsResult,
): DnsLookupExplanation {
  return {
    cacheRecords: result.cache_records ?? [],
    dynamicRedirectSource: result.dynamic_redirect_source,
    recordType,
    records: result.records ?? [],
    redirectId: result.redirect_id,
    ruleId: result.rule_id,
  };
}

function toLookupError(recordType: DnsRecordType, error: unknown): DnsLookupExplanation {
  return {
    cacheRecords: [],
    error: error instanceof Error ? error.message : 'DNS lookup failed.',
    recordType,
    records: [],
  };
}

function isValidIpv4(value: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) {
    return false;
  }

  return value.split('.').every((part) => {
    const num = Number(part);
    return Number.isInteger(num) && num >= 0 && num <= 255;
  });
}

function isValidIpv6(value: string): boolean {
  if (!value.includes(':')) {
    return false;
  }

  try {
    return new URL(`http://[${value}]/`).hostname === `[${value}]`;
  } catch {
    return false;
  }
}

function isUsableIpRecord(record: LandscapeRecord, lookupType: DnsRecordType): boolean {
  const rrType = record.rr_type.toUpperCase();
  const data = record.data.trim();

  if (!data) {
    return false;
  }

  if (lookupType === LandscapeDnsRecordType.A) {
    return rrType === 'A' && isValidIpv4(data);
  }

  if (lookupType === LandscapeDnsRecordType.AAAA) {
    return rrType === 'AAAA' && isValidIpv6(data);
  }

  return false;
}

function extractDestinationIps(lookups: DnsLookupExplanation[]): string[] {
  const seen = new Set<string>();
  const ips: string[] = [];

  for (const lookup of lookups) {
    for (const record of [...lookup.records, ...lookup.cacheRecords]) {
      const data = record.data.trim();
      if (!isUsableIpRecord(record, lookup.recordType) || seen.has(data)) {
        continue;
      }

      seen.add(data);
      ips.push(data);
    }
  }

  return ips;
}

function normalizeAction(verdict: FlowVerdictResult['verdicts'][number]): VerdictExplanation['action'] {
  return verdict.effective_mark.action.t;
}

function describeFlowMatch(flow: FlowMatchResult): string {
  const reasons: string[] = [];

  if (flow.flow_id_by_ip != null) {
    reasons.push(`IP match ${flow.flow_id_by_ip}`);
  }

  if (flow.flow_id_by_mac != null) {
    reasons.push(`MAC match ${flow.flow_id_by_mac}`);
  }

  if (reasons.length === 0) {
    return `Flow ${flow.effective_flow_id} was selected by the Router default path.`;
  }

  return `Flow ${flow.effective_flow_id} was selected from ${reasons.join(' and ')}.`;
}

function summarizeVerdicts(verdicts: VerdictExplanation[], flow: FlowMatchResult): SiteInspection['summary'] {
  if (verdicts.length === 0) {
    return {
      action: 'no-records',
      detail: `${describeFlowMatch(flow)} No A/AAAA result was available for a verdict trace.`,
      label: 'No destination IPs',
    };
  }

  const actions = [...new Set(verdicts.map((verdict) => verdict.action))];
  if (actions.length > 1) {
    return {
      action: 'mixed',
      detail: `${describeFlowMatch(flow)} Different destination IPs resolve to different actions.`,
      label: 'Mixed verdicts',
    };
  }

  const action = actions[0];
  const labels: Record<VerdictExplanation['action'], string> = {
    direct: 'Direct',
    drop: 'Dropped',
    keep_going: 'Keep going',
    redirect: 'Redirected',
  };

  return {
    action,
    detail: `${describeFlowMatch(flow)} All traced destination IPs resolve to ${labels[action].toLowerCase()}.`,
    label: labels[action],
  };
}

function summarizeNoVerdict(
  dnsLookups: DnsLookupExplanation[],
  flow: FlowMatchResult,
  verdictError?: string,
): SiteInspection['summary'] {
  const hasDnsRecords = dnsLookups.some(
    (lookup) => lookup.records.length > 0 || lookup.cacheRecords.length > 0,
  );

  if (verdictError) {
    return {
      action: 'no-records',
      detail: `${describeFlowMatch(flow)} DNS results were found, but verdict tracing failed: ${verdictError}`,
      label: 'Verdict unavailable',
    };
  }

  if (hasDnsRecords) {
    return {
      action: 'no-records',
      detail: `${describeFlowMatch(flow)} DNS results were found, but no usable A/AAAA IPs were available for verdict tracing.`,
      label: 'No usable IPs',
    };
  }

  return summarizeVerdicts([], flow);
}

export function getCacheInconsistencySummary(
  inspection: SiteInspection,
): CacheInconsistencySummary | null {
  const cachedVerdicts = inspection.verdicts.filter((verdict) => verdict.hasCache);
  const inconsistentVerdicts = cachedVerdicts.filter((verdict) => !verdict.cacheConsistent);

  if (inconsistentVerdicts.length === 0) {
    return null;
  }

  return {
    cachedVerdictCount: cachedVerdicts.length,
    inconsistentIps: inconsistentVerdicts.map((verdict) => verdict.dstIp),
    inconsistentVerdictCount: inconsistentVerdicts.length,
  };
}

function getCachedFlowDetail(
  flowId: number | undefined | null,
  context: PreparedInspectionContext,
): Promise<FlowDetail | undefined> {
  if (flowId == null) {
    return Promise.resolve(undefined);
  }

  if (!context.flowCache.has(flowId)) {
    context.flowCache.set(
      flowId,
      getFlowRuleByFlowId(flowId)
        .then((config: FlowConfig) => toFlowDetail(config))
        .catch(() => null),
    );
  }

  return context.flowCache.get(flowId)!.then((detail) => detail ?? undefined);
}

function getCachedDnsRuleDetail(
  id: string | undefined,
  context: PreparedInspectionContext,
): Promise<DnsRuleDetail | undefined> {
  if (!id) {
    return Promise.resolve(undefined);
  }

  if (!context.dnsRuleCache.has(id)) {
    context.dnsRuleCache.set(
      id,
      getDnsRule(id)
        .then((config: DNSRuleConfig) => toDnsRuleDetail(config))
        .catch(() => null),
    );
  }

  return context.dnsRuleCache.get(id)!.then((detail) => detail ?? undefined);
}

function getCachedDnsRedirectDetail(
  id: string | undefined,
  context: PreparedInspectionContext,
): Promise<DnsRedirectDetail | undefined> {
  if (!id) {
    return Promise.resolve(undefined);
  }

  if (!context.dnsRedirectCache.has(id)) {
    context.dnsRedirectCache.set(
      id,
      getDnsRedirect(id)
        .then((config: DNSRedirectRule) => toDnsRedirectDetail(config))
        .catch(() => null),
    );
  }

  return context.dnsRedirectCache.get(id)!.then((detail) => detail ?? undefined);
}

async function buildInspectionContext(): Promise<PreparedInspectionContext> {
  const client = await getClientCaller();
  const sourceFields = getSourceFields(client);
  const flow = await traceFlowMatch(sourceFields);

  return {
    client,
    dnsRedirectCache: new Map(),
    dnsRuleCache: new Map(),
    flow,
    flowCache: new Map(),
    sourceFields,
  };
}

async function inspectTargetWithContext(
  target: InspectionTarget,
  context: PreparedInspectionContext,
): Promise<SiteInspection> {
  const [aLookup, aaaaLookup] = await Promise.allSettled([
    checkDomain({
      domain: target.hostname,
      flow_id: context.flow.effective_flow_id,
      record_type: LandscapeDnsRecordType.A,
    }),
    checkDomain({
      domain: target.hostname,
      flow_id: context.flow.effective_flow_id,
      record_type: LandscapeDnsRecordType.AAAA,
    }),
  ]);

  const dnsLookups: DnsLookupExplanation[] = [
    aLookup.status === 'fulfilled'
      ? toLookupExplanation(LandscapeDnsRecordType.A, aLookup.value)
      : toLookupError(LandscapeDnsRecordType.A, aLookup.reason),
    aaaaLookup.status === 'fulfilled'
      ? toLookupExplanation(LandscapeDnsRecordType.AAAA, aaaaLookup.value)
      : toLookupError(LandscapeDnsRecordType.AAAA, aaaaLookup.reason),
  ];

  const [effectiveFlowDetail, byIpFlowDetail, byMacFlowDetail, enrichedDnsLookups] = await Promise.all([
    getCachedFlowDetail(context.flow.effective_flow_id, context),
    getCachedFlowDetail(context.flow.flow_id_by_ip, context),
    getCachedFlowDetail(context.flow.flow_id_by_mac, context),
    Promise.all(
      dnsLookups.map(async (lookup) => ({
        ...lookup,
        redirectDetail: await getCachedDnsRedirectDetail(lookup.redirectId, context),
        ruleDetail: await getCachedDnsRuleDetail(lookup.ruleId, context),
      })),
    ),
  ]);

  const destinationIps = extractDestinationIps(enrichedDnsLookups);
  let verdictResponse: FlowVerdictResult | null = null;
  let verdictError: string | undefined;

  if (destinationIps.length > 0) {
    try {
      verdictResponse = await traceVerdict({
        ...context.sourceFields,
        dst_ips: destinationIps,
        flow_id: context.flow.effective_flow_id,
      });
    } catch (error) {
      verdictError = getErrorMessage(error);
    }
  }

  const verdicts: VerdictExplanation[] =
    verdictResponse?.verdicts.map((verdict: FlowVerdictResult['verdicts'][number]) => ({
      action: normalizeAction(verdict),
      allowReusePort: verdict.effective_mark.allow_reuse_port,
      cacheConsistent: verdict.cache_consistent,
      dnsRulePriority: verdict.dns_rule_match?.priority,
      dstIp: verdict.dst_ip,
      effectiveFlowId: verdict.effective_mark.flow_id,
      hasCache: verdict.has_cache,
      ipRulePriority: verdict.ip_rule_match?.priority,
    })) ?? [];

  return {
    client: context.client,
    dnsLookups: enrichedDnsLookups,
    flow: context.flow,
    flowDetails: {
      byIp: byIpFlowDetail,
      byMac: byMacFlowDetail,
      effective: effectiveFlowDetail,
    },
    inspectedAt: Date.now(),
    summary:
      verdicts.length > 0
        ? summarizeVerdicts(verdicts, context.flow)
        : summarizeNoVerdict(enrichedDnsLookups, context.flow, verdictError),
    target,
    verdictError,
    verdicts,
  };
}

async function mapWithConcurrency<T, U>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<U>,
): Promise<U[]> {
  const results = new Array<U>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );

  return results;
}

export async function inspectCurrentSite(
  target: CurrentSite,
  config: RouterConfig,
): Promise<SiteInspection> {
  return withRouterClient(config, async () => {
    const context = await buildInspectionContext();
    return inspectTargetWithContext(target, context);
  });
}

export async function inspectHostname(
  hostname: string,
  config: RouterConfig,
): Promise<SiteInspection> {
  return withRouterClient(config, async () => {
    const context = await buildInspectionContext();
    return inspectTargetWithContext({ hostname }, context);
  });
}

export async function inspectHostnames(
  hostnames: string[],
  config: RouterConfig,
): Promise<BulkInspectionResult[]> {
  const uniqueHostnames = [...new Set(hostnames.map((hostname) => hostname.trim()).filter(Boolean))];

  if (uniqueHostnames.length === 0) {
    return [];
  }

  return withRouterClient(config, async () => {
    const context = await buildInspectionContext();

    return mapWithConcurrency(uniqueHostnames, 4, async (hostname) => {
      try {
        const inspection = await inspectTargetWithContext({ hostname }, context);
        return { hostname, inspection } satisfies BulkInspectionResult;
      } catch (error) {
        return {
          error: getErrorMessage(error),
          hostname,
        } satisfies BulkInspectionResult;
      }
    });
  });
}
