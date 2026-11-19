export class GameRules { phase:'ready'|'live'|'over'='ready'; strikes=0; score=0; ballScore=0; hits=0; ready(){if(this.phase!=='ready')return false;this.phase='live';this.ballScore=0;return true} hit(n:number){if(this.phase==='live'){this.score+=n;this.ballScore+=n;this.hits++}} drain(){if(this.phase!=='live')return;this.strikes++;this.phase=this.strikes>=3?'over':'ready'} reset(){this.phase='ready';this.strikes=0;this.score=0;this.ballScore=0;this.hits=0}}
export function eligible(active:boolean,down:number,inFront:number,already:number){return active&&down>0&&inFront>0&&!already}
export function contactVelocity(phase:number){let a=(phase-.5)*1.2;return {x:16*Math.sin(a),y:-16*Math.cos(a)}}
export class TouchInput { left:number|null=null; x=0; down(id:number,x:number,width:number){if(x<width/2&&this.left===null){this.left=id;this.x=x;return false}return x>=width/2} move(id:number,x:number){if(this.left!==id)return 0;let d=x-this.x;this.x=x;return d} up(id:number){if(this.left===id)this.left=null} }
export function batAngle(phase:number){return phase>=0&&phase<=1 ? (2*Math.PI/3)*(1-2*phase) : 2*Math.PI/3}
/** Collision region follows the bat on the batter's right, never the body. */
export function batContact(c:{phase:number;down:number;already:boolean;batterX:number;ballX:number;ballY:number}){
 const {phase,down,already,batterX,ballX,ballY}=c;
 if(phase<.2||phase>.8||down<=0||already)return null;
 const offset=ballX-batterX;
 if(offset<.3||offset>1.65||ballY<24.95||ballY>25.39)return null;
 return contactVelocity((ballY-24.95)/.44);
}
