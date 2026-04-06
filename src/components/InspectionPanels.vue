<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { NAlert, NCard, NFlex, NTag } from 'naive-ui';
import type { FlowDetail, SiteInspection } from '../lib/router-inspector';
import { getCacheInconsistencySummary } from '../lib/router-inspector';
import { formatChipClass, formatTimestamp } from '../lib/format';

const props = defineProps<{
  heading?: string;
  highlightIp?: string;
  inspection: SiteInspection;
}>();

interface FlowHighlight {
  key: string;
  label: string;
  meta: string;
  tone: string;
  value: string;
}

const { t } = useI18n();

function buildFlowHighlight(
  key: string,
  label: string,
  flowId: number | undefined | null,
  detail: FlowDetail | undefined,
  tone: string,
): FlowHighlight | null {
  if (flowId == null) {
    return null;
  }

  return {
    key,
    label,
    meta: detail?.targetSummary || `ID ${flowId}`,
    tone,
    value: detail?.title || `Flow ${flowId}`,
  };
}

const flowHighlights = computed(() => {
  const { effective_flow_id, flow_id_by_ip, flow_id_by_mac } = props.inspection.flow;
  const items = [
    buildFlowHighlight(
      'effective',
      t('fields.effectiveFlow'),
      effective_flow_id,
      props.inspection.flowDetails.effective,
      'primary',
    ),
  ];

  if (flow_id_by_ip != null && flow_id_by_ip !== effective_flow_id) {
    items.push(
      buildFlowHighlight(
        'ip',
        t('fields.flowByIp'),
        flow_id_by_ip,
        props.inspection.flowDetails.byIp,
        'info',
      ),
    );
  }

  if (
    flow_id_by_mac != null &&
    flow_id_by_mac !== effective_flow_id &&
    flow_id_by_mac !== flow_id_by_ip
  ) {
    items.push(
      buildFlowHighlight(
        'mac',
        t('fields.flowByMac'),
        flow_id_by_mac,
        props.inspection.flowDetails.byMac,
        'info',
      ),
    );
  }

  return items.filter((item): item is FlowHighlight => item !== null);
});

const cacheWarning = computed(() => getCacheInconsistencySummary(props.inspection));

type LookupRecord = SiteInspection['dnsLookups'][number]['records'][number];
type VerdictRecord = SiteInspection['verdicts'][number];

function isHighlightedRecord(record: LookupRecord) {
  return !!props.highlightIp && record.data.trim() === props.highlightIp;
}

function sortRecords(records: LookupRecord[]): LookupRecord[] {
  return [...records].sort((left, right) => {
    const leftHighlighted = isHighlightedRecord(left);
    const rightHighlighted = isHighlightedRecord(right);

    if (leftHighlighted !== rightHighlighted) {
      return leftHighlighted ? -1 : 1;
    }

    return left.data.localeCompare(right.data);
  });
}

function isHighlightedVerdict(verdict: VerdictRecord) {
  return !!props.highlightIp && verdict.dstIp.trim() === props.highlightIp;
}

const sortedVerdicts = computed(() => {
  return [...props.inspection.verdicts].sort((left, right) => {
    const leftHighlighted = isHighlightedVerdict(left);
    const rightHighlighted = isHighlightedVerdict(right);

    if (leftHighlighted !== rightHighlighted) {
      return leftHighlighted ? -1 : 1;
    }

    return left.dstIp.localeCompare(right.dstIp);
  });
});

function boolTone(value: boolean) {
  return value ? 'success' : 'default';
}
</script>

<template>
  <NCard size="small">
    <NFlex justify="space-between" align="start" :wrap="false">
      <div class="grow">
        <div v-if="heading" class="section-title section-tight">{{ heading }}</div>
        <div class="overview-host mono">{{ inspection.target.hostname }}</div>
        <div class="panel-meta panel-tight">{{ inspection.summary.detail }}</div>
      </div>
      <NTag round :class="formatChipClass(inspection.summary.action)">
        {{ inspection.summary.label }}
      </NTag>
    </NFlex>

    <NFlex v-if="flowHighlights.length > 0" :size="8" class="highlight-row compact-top">
      <div v-for="item in flowHighlights" :key="item.key" class="highlight-pill" :data-tone="item.tone">
        <span class="highlight-label">{{ item.label }}</span>
        <span class="highlight-value">{{ item.value }}</span>
        <span class="highlight-meta">{{ item.meta }}</span>
      </div>
    </NFlex>
    <NAlert v-if="cacheWarning" type="warning" :show-icon="false" style="margin-bottom: 10px;">
      {{ t('cacheMismatchWarning', { count: cacheWarning.inconsistentVerdictCount }) }}
    </NAlert>
    <div class="panel-meta">{{ t('inspectedAt', { time: formatTimestamp(inspection.inspectedAt) }) }}</div>
  </NCard>

  <NCard size="small" :title="t('dnsResolution')">
    <NFlex vertical :size="10">
      <NCard v-for="lookup in inspection.dnsLookups" :key="lookup.recordType" embedded size="small">
        <NFlex justify="space-between" align="center">
          <strong>{{ lookup.recordType }}</strong>
          <NFlex :size="6" align="center">
            <NTag v-if="lookup.ruleId" type="info" size="small" round>
              {{ t('fields.ruleId') }} {{ lookup.ruleId }}
            </NTag>
            <NTag v-if="lookup.redirectId" type="warning" size="small" round>
              {{ t('fields.redirectId') }} {{ lookup.redirectId }}
            </NTag>
            <NTag v-if="lookup.error" type="error" size="small">
              {{ t('lookupFailed') }}
            </NTag>
          </NFlex>
        </NFlex>

        <div v-if="lookup.ruleDetail" class="detail-block">
          <NFlex :size="6" class="row wrap">
            <NTag type="info" round size="small">{{ lookup.ruleDetail.title }}</NTag>
            <NTag size="small" round>{{ lookup.ruleDetail.action }}</NTag>
            <NTag size="small" round>Flow {{ lookup.ruleDetail.flowId }}</NTag>
            <NTag size="small" round>#{{ lookup.ruleDetail.index }}</NTag>
          </NFlex>
          <div class="panel-meta mono">{{ lookup.ruleDetail.sourceSummary }}</div>
        </div>

        <div v-if="lookup.redirectDetail" class="detail-block">
          <NFlex :size="6" class="row wrap">
            <NTag type="warning" round size="small">{{ lookup.redirectDetail.title }}</NTag>
            <NTag size="small" round>{{ lookup.redirectDetail.answerMode }}</NTag>
            <NTag size="small" round>{{ lookup.redirectDetail.applyFlowSummary }}</NTag>
          </NFlex>
          <div class="panel-meta mono">{{ lookup.redirectDetail.resultSummary }}</div>
          <div class="panel-meta mono">{{ lookup.redirectDetail.sourceSummary }}</div>
        </div>

        <div class="panel-meta">{{ t('records') }}:</div>
        <div v-if="lookup.records.length > 0" class="record-grid">
          <div
            v-for="record in sortRecords(lookup.records)"
            :key="`${lookup.recordType}-record-${record.rr_type}-${record.data}`"
            class="record-card"
            :class="{ 'record-card-active': isHighlightedRecord(record) }"
          >
            <span class="record-card-type">{{ record.rr_type }}</span>
            <code class="record-card-value">{{ record.data }}</code>
          </div>
        </div>
        <div v-else class="panel-meta">{{ t('none') }}</div>

        <template v-if="lookup.cacheRecords.length > 0">
          <div class="panel-meta">{{ t('cache') }}:</div>
          <div class="record-grid">
            <div
              v-for="record in sortRecords(lookup.cacheRecords)"
              :key="`${lookup.recordType}-cache-${record.rr_type}-${record.data}`"
              class="record-card"
              :class="{ 'record-card-active': isHighlightedRecord(record) }"
            >
              <span class="record-card-type">{{ record.rr_type }}</span>
              <code class="record-card-value">{{ record.data }}</code>
            </div>
          </div>
        </template>
        <div v-if="lookup.dynamicRedirectSource" class="panel-meta mono">
          {{ t('fields.dynamicRedirect') }}: {{ lookup.dynamicRedirectSource }}
        </div>
        <div v-if="lookup.error" class="panel-meta">{{ lookup.error }}</div>
      </NCard>
    </NFlex>
  </NCard>

  <NCard size="small" :title="t('destinationVerdicts')">
    <NAlert v-if="inspection.verdictError" type="error" :show-icon="false" style="margin-bottom: 10px;">
      {{ inspection.verdictError }}
    </NAlert>

    <div v-if="inspection.verdicts.length === 0" class="panel-meta">
      {{ t('noVerdicts') }}
    </div>

    <NFlex v-else vertical :size="10">
      <NCard
        v-for="verdict in sortedVerdicts"
        :key="verdict.dstIp"
        embedded
        size="small"
        :class="{ 'verdict-card-active': isHighlightedVerdict(verdict) }"
      >
        <NFlex justify="space-between" align="center">
          <code>{{ verdict.dstIp }}</code>
          <NTag round :class="formatChipClass(verdict.action)">
            {{ verdict.action }}
          </NTag>
        </NFlex>

        <NFlex class="highlight-row compact-top" :size="8">
          <div class="highlight-pill" data-tone="primary">
            <span class="highlight-label">{{ t('fields.flowId') }}</span>
            <span class="highlight-value">{{ verdict.effectiveFlowId }}</span>
          </div>
          <div v-if="verdict.dnsRulePriority != null" class="highlight-pill" data-tone="info">
            <span class="highlight-label">{{ t('fields.dnsPriority') }}</span>
            <span class="highlight-value">{{ verdict.dnsRulePriority }}</span>
          </div>
          <div v-if="verdict.ipRulePriority != null" class="highlight-pill" data-tone="warning">
            <span class="highlight-label">{{ t('fields.ipPriority') }}</span>
            <span class="highlight-value">{{ verdict.ipRulePriority }}</span>
          </div>
          <div class="highlight-pill" :data-tone="boolTone(verdict.hasCache)">
            <span class="highlight-label">{{ t('fields.hasCache') }}</span>
            <span class="highlight-value">{{ verdict.hasCache }}</span>
          </div>
        </NFlex>
      </NCard>
    </NFlex>
  </NCard>
</template>
