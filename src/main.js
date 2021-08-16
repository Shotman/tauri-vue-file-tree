import Vue from 'vue'
import App from './App.vue'
import store from './store'
import devtools from '@vue/devtools'
Vue.config.productionTip = false

if (process.env.NODE_ENV === 'development') {
  devtools.connect()
}
new Vue({
  store,
  render: h => h(App)
}).$mount('#app')
