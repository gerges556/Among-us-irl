const express=require("express");
const http=require("http");
const {Server}=require("socket.io");
const path=require("path");
const crypto=require("crypto");

const app=express(), server=http.createServer(app), io=new Server(server);
app.use(express.static(path.join(__dirname,"public")));

const rooms=new Map();
const tasks=["المس الحيطة","هات زجاجة مياه","عدّ 10 خطوات","المس باب الغرفة","جيب قلم","قف بجانب كرسي","صفّ 3 أشياء على بعض","رتّب 3 أشياء فوق بعض"];

function code(){return crypto.randomBytes(2).toString("hex").toUpperCase()}
function publicRoom(r){
 return {code:r.code,host:r.host,started:r.started,players:[...r.players.values()].map(p=>({id:p.id,name:p.name,alive:p.alive}))};
}
function leaveRoom(socket){
 const old=socket.roomCode;if(!old)return;
 const r=rooms.get(old);if(!r)return;
 r.players.delete(socket.id);socket.leave(old);
 if(r.host===socket.id) r.host=r.players.keys().next().value;
 if(!r.players.size) rooms.delete(old); else io.to(old).emit("room",publicRoom(r));
 socket.roomCode=null;
}
io.on("connection",socket=>{
 socket.on("create",({name},cb)=>{
   leaveRoom(socket); let c; do{c=code()}while(rooms.has(c));
   const r={code:c,host:socket.id,started:false,impostor:null,players:new Map()};
   r.players.set(socket.id,{id:socket.id,name:String(name||"لاعب").slice(0,18),alive:true});
   rooms.set(c,r);socket.join(c);socket.roomCode=c;cb({ok:true,code:c});io.to(c).emit("room",publicRoom(r));
 });
 socket.on("join",({code,name},cb)=>{
   const r=rooms.get(String(code||"").toUpperCase()); if(!r)return cb({ok:false,msg:"الغرفة غير موجودة"});
   if(r.started)return cb({ok:false,msg:"الجولة بدأت بالفعل"}); if(r.players.size>=15)return cb({ok:false,msg:"الغرفة ممتلئة"});
   r.players.set(socket.id,{id:socket.id,name:String(name||"لاعب").slice(0,18),alive:true});
   socket.join(r.code);socket.roomCode=r.code;cb({ok:true,code:r.code});io.to(r.code).emit("room",publicRoom(r));
 });
 socket.on("start",()=>{
   const r=rooms.get(socket.roomCode);if(!r||r.host!==socket.id||r.players.size<3)return;
   const arr=[...r.players.values()];r.impostor=arr[Math.floor(Math.random()*arr.length)].id;r.started=true;
   for(const p of arr) io.to(p.id).emit("role",{impostor:p.id===r.impostor,tasks:p.id===r.impostor?[]:[...tasks].sort(()=>Math.random()-.5).slice(0,3)});
   io.to(r.code).emit("started");
 });
 socket.on("meeting",()=>{
   const r=rooms.get(socket.roomCode);if(!r||!r.started)return;
   io.to(r.code).emit("meeting", {seconds:30});
 });
 socket.on("vote",({target})=>{
   const r=rooms.get(socket.roomCode);if(!r||!r.started)return;
   const p=r.players.get(socket.id), t=r.players.get(target); if(!p?.alive||!t?.alive)return;
   r.votes=r.votes||{};r.votes[socket.id]=target;
   const alive=[...r.players.values()].filter(x=>x.alive);
   if(Object.keys(r.votes).length>=alive.length){
     const counts={};Object.values(r.votes).forEach(x=>counts[x]=(counts[x]||0)+1);
     const max=Math.max(...Object.values(counts)), top=Object.keys(counts).filter(x=>counts[x]===max);
     if(top.length===1) r.players.get(top[0]).alive=false;
     r.votes={};io.to(r.code).emit("room",publicRoom(r));
     const impAlive=r.players.get(r.impostor)?.alive;
     const crewAlive=[...r.players.values()].filter(x=>x.alive&&x.id!==r.impostor).length;
     if(!impAlive) io.to(r.code).emit("result",{winner:"crew"});
     else if(crewAlive<=0) io.to(r.code).emit("result",{winner:"impostor"});
     else io.to(r.code).emit("voteDone");
   }
 });
 socket.on("disconnect",()=>leaveRoom(socket));
});
server.listen(process.env.PORT||3000,()=>console.log("Among Us IRL running"));
