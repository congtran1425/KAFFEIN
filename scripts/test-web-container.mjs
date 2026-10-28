// Real image check under the same Web memory/CPU limit used in ECS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';

const onPath=process.platform==='win32' ? spawnSync('where.exe',['docker'],{encoding:'utf8'}) : undefined;
const docker=process.platform==='win32'
  ? onPath.status===0 ? onPath.stdout.trim().split(/\r?\n/)[0] : path.join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe') : 'docker';
const run=args=>execFileSync(docker,args,{encoding:'utf8'}).trim();

test('Web container: non-root, 64 MiB, SPA, assets, cache, headers and correct API', {timeout:60000}, async t=>{
  const image=process.env.KAFFEIN_WEB_TEST_IMAGE || 'kaffein-web:20261023-web-r1';
  const id=run(['run','--detach','--rm','--memory','64m','--cpus','0.25','--label','kaffein.purpose=web-hosting-test','--publish','127.0.0.1::8080',image]);
  t.after(()=>run(['stop','--time','3',id]));
  const info=JSON.parse(run(['inspect',id]))[0];
  assert.equal(info.Config.User,'101');
  assert.equal(info.HostConfig.Memory,64*1024*1024);
  const port=info.NetworkSettings.Ports['8080/tcp'][0].HostPort;
  const base=`http://127.0.0.1:${port}`;
  for(let n=0;n<20;n++){
    try{if((await fetch(base+'/health')).status===200)break;}catch{}
    await new Promise(r=>setTimeout(r,250));
  }
  for(const route of ['/','/login','/inventory','/menu']){
    const r=await fetch(base+route);
    assert.equal(r.status,200,route);
    assert.equal(r.headers.get('cache-control'),'no-store');
    assert.equal(r.headers.get('x-content-type-options'),'nosniff');
    assert.equal(r.headers.get('x-frame-options'),'DENY');
    const html=await r.text(); assert.ok(html.includes('id="root"'));
  }
  const html=await (await fetch(base)).text();
  const asset=html.match(/src="(\/assets\/[^\"]+\.js)"/)[1];
  const r=await fetch(base+asset);
  assert.match(r.headers.get('content-type'),/javascript/);
  assert.match(r.headers.get('cache-control'),/immutable/);
  assert.ok((await r.text()).includes('https://api-aws.congtc145.id.vn/api/v1'));
  for(const route of ['/assets/does-not-exist.js','/.env','/.git/config','/api/v1/auth/me']){
    const r=await fetch(base+route);assert.equal(r.status,404,route);
    assert.ok(!(await r.text()).includes('id="root"'));
  }
  assert.equal(JSON.parse(run(['inspect',id]))[0].State.OOMKilled,false);
});
