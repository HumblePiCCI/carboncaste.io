const form = document.querySelector('#access-form');
const input = document.querySelector('#trip-code');
const message = document.querySelector('#access-message');

function destination() {
  const candidate = new URLSearchParams(window.location.search).get('next') || '/iceland26/';
  return candidate === '/iceland26' || candidate.startsWith('/iceland26/')
    ? candidate
    : '/iceland26/';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true;
  message.textContent = 'Checking the shared code…';
  try {
    const response = await fetch('/api/iceland26/login', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code: input.value }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Trip access could not be checked.');
    window.location.assign(destination());
  } catch (error) {
    message.textContent = error.message;
    input.select();
    button.disabled = false;
  }
});
