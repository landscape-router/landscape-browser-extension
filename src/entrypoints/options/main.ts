import { createApp } from 'vue';
import App from './App.vue';
import '../../assets/base.css';
import { createAppI18n } from '../../lib/i18n';

createApp(App).use(createAppI18n()).mount('#root');
