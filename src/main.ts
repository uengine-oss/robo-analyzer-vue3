import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/main.scss'
import { initializeAppSettings } from './config/appSettings'

// 앱 설정 초기화 (document.title 등)
initializeAppSettings()

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')

