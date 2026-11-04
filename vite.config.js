import { defineConfig } from 'vite';

export default defineConfig({
  // Rutas relativas: el mismo build anda en GitHub Pages (/mundo-en-llamas/) y en la compu.
  base: './',
  server: { host: true }, // para entrar desde el celular en la misma red
});
