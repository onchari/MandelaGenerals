import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  base: '/MandelaGenerals/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(root, 'index.html'),
        signin: resolve(root, 'signin.html'),
        signup: resolve(root, 'signup.html'),
        forgetpassword: resolve(root, 'forgetpassword.html'),
        productlist: resolve(root, 'productlist.html'),
        addproduct: resolve(root, 'addproduct.html'),
        editproduct: resolve(root, 'editproduct.html'),
        productDetails: resolve(root, 'product-details.html'),
        inventoryreport: resolve(root, 'inventoryreport.html'),
      },
    },
  },
});
