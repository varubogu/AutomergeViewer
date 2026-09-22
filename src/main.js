import { mount } from "svelte"
import App from "./App.svelte"
import "./app.css"

const target = document.getElementById("app")
if (!target) {
  throw new Error("マウント先が見つかりません")
}

mount(App, { target })
