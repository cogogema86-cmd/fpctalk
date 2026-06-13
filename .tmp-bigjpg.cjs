const sharp = require("sharp");
const w=1500,h=2000, ch=3;
const buf = Buffer.alloc(w*h*ch);
for (let i=0;i<buf.length;i++) buf[i]=Math.floor(Math.random()*256);
sharp(buf,{raw:{width:w,height:h,channels:ch}}).jpeg({quality:80}).toFile(".tmp-big-form.jpg")
  .then(()=>{const fs=require("fs");console.log("size:", (fs.statSync(".tmp-big-form.jpg").size/1024/1024).toFixed(2),"MB");})
  .catch(e=>{console.error(e);process.exit(1)});
