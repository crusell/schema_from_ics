import { registerSW } from 'virtual:pwa-register';
import { createApp } from './app';
import './style.css';

createApp(document.getElementById('app')!);

// Service worker: precaches the app shell. New versions are picked up
// automatically on the next load (registerType: 'autoUpdate').
registerSW({ immediate: true });
