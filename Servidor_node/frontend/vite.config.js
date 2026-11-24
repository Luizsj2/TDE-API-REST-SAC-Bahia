import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        host: '127.0.0.1',
        proxy: {
            '/web-api': 'http://127.0.0.1:' + (process.env.SAC_PORT || '18080'),
        },
    },
});
