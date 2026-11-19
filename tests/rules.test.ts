import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GameRules, contactVelocity, eligible, TouchInput } from '../src/rules.ts';
test('ready serves once; drain waits; third drain ends; score banks',()=>{const g=new GameRules(); assert.equal(g.ready(),true);assert.equal(g.ready(),false);g.hit(100);g.drain();assert.equal(g.score,100);assert.equal(g.phase,'ready');g.ready();g.drain();g.ready();g.drain();assert.equal(g.phase,'over');assert.equal(g.strikes,3)});
test('only downward in-front active balls hit; early and late equal speed',()=>{assert.equal(eligible(true,1,1,0),true);assert.equal(eligible(false,1,1,0),false);assert.equal(eligible(true,-1,1,0),false);assert.equal(eligible(true,1,-1,0),false);assert.equal(eligible(true,1,1,1),false);const a=contactVelocity(0),b=contactVelocity(1);assert.ok(a.x<0&&b.x>0&&a.y<0&&b.y<0);assert.ok(Math.abs(Math.hypot(a.x,a.y)-Math.hypot(b.x,b.y))<1e-8)});
test('touch drag stays relative, permits independent swing',()=>{const i=new TouchInput();assert.equal(i.down(1,100,400),false);assert.equal(i.move(1,130),30);assert.equal(i.down(2,300,400),true);assert.equal(i.move(1,150),20);i.up(1);assert.equal(i.move(1,180),0)});

test('bat sweeps smoothly from lower left through right to upper left', async()=>{const {batAngle}=await import('../src/rules.ts');assert.ok(Math.abs(batAngle(-1)-2*Math.PI/3)<.001);assert.ok(Math.abs(batAngle(0)-2*Math.PI/3)<.001);assert.ok(Math.abs(batAngle(.5))<.001);assert.ok(Math.abs(batAngle(1)+2*Math.PI/3)<.001)});

test('bat contact matches the right side and provides early, center and late aim', async()=>{
 const { batContact }=await import('../src/rules.ts');
 const swing={phase:.5,down:8,already:false,batterX:10};
 assert.equal(batContact({...swing,ballX:10,ballY:25.1}),null,'above the batter is not the bat');
 assert.equal(batContact({...swing,ballX:11,ballY:24.7}),null,'ball is above the contact area');
 assert.equal(batContact({...swing,ballX:11,ballY:25.1,down:-8}),null,'upward save cannot hit');
 assert.equal(batContact({...swing,ballX:11,ballY:25.5}),null,'ball behind bat cannot hit');
 const early=batContact({...swing,ballX:11,ballY:24.95});
 const center=batContact({...swing,ballX:11,ballY:25.17});
 const late=batContact({...swing,ballX:11,ballY:25.39});
 assert.ok(early && center && late);assert.ok(early.x<0 && Math.abs(center.x)<.001 && late.x>0);assert.ok(early.y<0&&late.y<0);assert.ok(Math.abs(Math.hypot(early.x,early.y)-Math.hypot(late.x,late.y))<1e-8);
});

test('different swing times on an incoming pitch yield left, center and right', async()=>{
 const { batContact }=await import('../src/rules.ts');
 function pitch(swingStart:number){for(let t=0;t<.2;t+=1/120){const result=batContact({phase:(t-swingStart)/.23,down:18,already:false,batterX:8.9,ballX:10,ballY:24.9+18*t});if(result)return result.x}return null}
 const early=pitch(-.05),center=pitch(-.035),late=pitch(-.025);
 assert.ok(early!==null && early<0,`early: ${early}`);assert.ok(center!==null && Math.abs(center)<3,`center: ${center}`);assert.ok(late!==null && late>0,`late: ${late}`);
});
