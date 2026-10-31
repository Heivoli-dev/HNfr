import { setupSignupCaptcha } from './signup-captcha.js';
export const signupCaptcha = setupSignupCaptcha({
  server: 'https://heivoli-discord-auth.heivoli-discord-auth.workers.dev',
  container: document.querySelector('#signup-captcha'),
  status: document.querySelector('#captcha-status'),
  buttons: [document.querySelector('#google-login'), document.querySelector('#discord-login')]
});
