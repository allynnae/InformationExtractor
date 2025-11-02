import { createApp } from "vue";
import PrimeVue from "primevue/config";
import Button from "primevue/button";
import Message from "primevue/message";
import App from "./App.vue";
import "./style.css";
import "primevue/resources/themes/aura-light-blue/theme.css";
import "primeicons/primeicons.css";

const app = createApp(App);

app.use(PrimeVue, { ripple: true });
app.component("Button", Button);
app.component("Message", Message);

app.mount("#app");
