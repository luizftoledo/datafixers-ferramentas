// Senha do Show do Milhão, verificada no servidor (protege página, imagens e áudios).
const PASSWORD_SHA256 = 'b852ca55ec1f2adc7a95c2f1fd52aabf18012a1b11f000e7f4ebdcc59bb781ac';
const COOKIE = 'sdm_ok';

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function hasCookie(request) {
  const cookies = request.headers.get('Cookie') || '';
  return cookies.split(';').some(c => c.trim() === `${COOKIE}=${PASSWORD_SHA256}`);
}

function gatePage(error) {
  return new Response(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Show do Milhão</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; box-sizing: border-box;
    background: radial-gradient(circle at 50% 30%, #173e91, #040c24 70%); font-family: "Arial Black", Arial, sans-serif; color: #fff; }
  form { width: 100%; max-width: 380px; text-align: center; padding: 32px 24px; border: 3px solid #f5c518; border-radius: 22px;
    background: linear-gradient(145deg, #174da8, #071747); box-shadow: 0 0 40px #f5c51866; box-sizing: border-box; }
  h1 { margin: 0 0 20px; color: #f5c518; font-size: 2.2rem; line-height: 1.05; text-shadow: 0 3px 0 #74420a; }
  input { width: 100%; box-sizing: border-box; padding: 14px; font-size: 1.1rem; border-radius: 12px; border: 2px solid #f5c518;
    background: #04102e; color: #fff; text-align: center; margin-bottom: 14px; }
  button { width: 100%; padding: 14px; font: inherit; font-size: 1.1rem; border: 0; border-radius: 12px; cursor: pointer;
    background: linear-gradient(#ffe27a, #f5b700); color: #2a1600; }
  p { color: #ff8a8a; margin: 0 0 12px; font-family: Arial, sans-serif; }
</style></head><body>
<form method="POST">
  <h1>SHOW DO<br>MILHÃO</h1>
  ${error ? '<p>Senha errada, tenta de novo!</p>' : ''}
  <input name="senha" type="password" placeholder="senha" autocomplete="off" autocapitalize="none" autofocus>
  <button type="submit">ENTRAR</button>
</form></body></html>`, { status: error ? 401 : 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export async function onRequest({ request, next }) {
  if (hasCookie(request)) return next();
  if (request.method === 'POST') {
    const form = await request.formData();
    const typed = String(form.get('senha') || '').trim().toLowerCase();
    if (await sha256(typed) === PASSWORD_SHA256) {
      return new Response(null, { status: 303, headers: {
        Location: new URL(request.url).pathname,
        'Set-Cookie': `${COOKIE}=${PASSWORD_SHA256}; Path=/show-do-milhao; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`
      } });
    }
    return gatePage(true);
  }
  return gatePage(false);
}
