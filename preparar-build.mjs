import fs from 'node:fs';
const deps = 'accepts,array-flatten,body-parser,bytes,call-bind-apply-helpers,call-bound,content-disposition,content-type,cookie,cookie-signature,debug,depd,destroy,dunder-proto,ee-first,encodeurl,es-define-property,es-errors,es-object-atoms,escape-html,etag,express,finalhandler,forwarded,fresh,function-bind,get-intrinsic,get-proto,gopd,has-symbols,hasown,http-errors,iconv-lite,inherits,ipaddr.js,math-intrinsics,media-typer,merge-descriptors,methods,mime,mime-db,mime-types,ms,negotiator,object-inspect,on-finished,parseurl,path-to-regexp,proxy-addr,qs,range-parser,raw-body,safe-buffer,safer-buffer,send,serve-static,setprototypeof,side-channel,side-channel-list,side-channel-map,side-channel-weakmap,statuses,toidentifier,type-is,unpipe,utils-merge,vary'.split(',');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.build.extraResources = [
  { from: 'recursos/node/node.exe', to: 'node/node.exe' },
  { from: 'servidor-painel.js', to: 'app/servidor-painel.js' },
  { from: 'public', to: 'app/public' },
  { from: 'src', to: 'app/src' },
  ...deps.sort().map((d) => ({ from: `node_modules/${d}`, to: `app/node_modules/${d}` })),
];
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
const checa = JSON.parse(fs.readFileSync('package.json', 'utf8'));
console.log('extraResources:', checa.build.extraResources.length, '| exemplo:', checa.build.extraResources[4]);
