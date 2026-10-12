const {defineConfig}=require('@playwright/test');
const path=require('node:path');
module.exports=defineConfig({
 testDir:'.',testMatch:'browser.spec.cjs',timeout:45000,workers:1,
 outputDir:path.resolve(__dirname,'../../test-results'),
 use:{baseURL:'http://127.0.0.1:4173',browserName:'chromium',screenshot:'only-on-failure'},
 webServer:{command:'python3 -m http.server 4173 --directory dist',cwd:path.resolve(__dirname,'../..'),url:'http://127.0.0.1:4173',reuseExistingServer:false},
 reporter:[['list'],['html',{outputFolder:'playwright-report',open:'never'}]]
});
