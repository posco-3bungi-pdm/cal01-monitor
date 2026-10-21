const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function normalizeServerUrl(value) {
  if (typeof value !== "string" || value.length > 2048) throw new Error("서버 주소를 확인해 주세요.");
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error("http:// 또는 https://로 시작하는 서버 주소를 입력해 주세요."); }
  if (url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) {
    throw new Error("아이디·암호·추가 경로 없이 서버 주소만 입력해 주세요.");
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname))) {
    throw new Error("팀 서버는 https:// 주소를 사용해 주세요. http://는 이 PC에서만 사용할 수 있어요.");
  }
  return url.origin;
}
module.exports = { normalizeServerUrl };
