const form = document.querySelector("#connection");
const input = document.querySelector("#server");
const button = document.querySelector("#connect");
const status = document.querySelector("#status");
window.cal01Connection.read().then(value => { input.value = value.server; status.textContent = value.error; });
form.addEventListener("submit", async event => {
  event.preventDefault();
  button.disabled = true;
  status.textContent = "서버를 확인하고 있어요…";
  try {
    const result = await window.cal01Connection.connect(input.value);
    status.textContent = result.ok ? "연결됐어요." : result.error;
  } catch { status.textContent = "연결 설정을 저장하지 못했어요."; }
  button.disabled = false;
});
