// ============================================================
//  overlay-slideshow.js — 增强版幻灯片编辑器（类 PowerPoint）
// ============================================================

import { overlayImages, renderAll, transactRender, getNextZIndex, getInsertY } from './overlay-images.js';
import { getActiveBlockId, getBlockWidth, pxToPct } from './overlay-block.js';

var SW=960, SH=540;

export var SLIDE_EFFECTS={
  slide:'\u6ED1\u52A8',fade:'\u6DE1\u5165\u6DE1\u51FA',cube:'\u7ACB\u65B9\u4F53',coverflow:'3D\u6D41',
  flip:'\u7FFB\u9875',cards:'\u5361\u7247',push:'\u63A8\u5165',wipe:'\u64E6\u9664',
  blinds:'\u767E\u53F6\u7A97',zoom:'\u7F29\u653E',clockwise:'\u65F6\u949F',
  ripple:'\u6CE2\u7EB9',curtain:'\u7A97\u5E18',fall:'\u4E0B\u843D'
};

var EA=[{l:'\u65E0',v:'none'},{l:'\u6DE1\u5165',v:'fadeIn'},{l:'\u5DE6\u6ED1\u5165',v:'slideInLeft'},{l:'\u53F3\u6ED1\u5165',v:'slideInRight'},
  {l:'\u4E0A\u6ED1\u5165',v:'slideInTop'},{l:'\u4E0B\u6ED1\u5165',v:'slideInBottom'},
  {l:'\u653E\u5927\u8FDB\u5165',v:'zoomIn'},{l:'\u7F29\u5C0F\u8FDB\u5165',v:'zoomOut'},
  {l:'\u5F39\u8DF3\u8FDB\u5165',v:'bounceIn'},{l:'\u7FFB\u8F6C\u8FDB\u5165',v:'flipIn'},
  {l:'\u65CB\u8F6C\u8FDB\u5165',v:'rotateIn'},{l:'\u6253\u5B57\u673A',v:'typewriter'}];

var XA=[{l:'\u65E0',v:'none'},{l:'\u6DE1\u51FA',v:'fadeOut'},{l:'\u5DE6\u6ED1\u51FA',v:'slideOutLeft'},
  {l:'\u53F3\u6ED1\u51FA',v:'slideOutRight'},{l:'\u4E0A\u6ED1\u51FA',v:'slideOutTop'},
  {l:'\u4E0B\u6ED1\u51FA',v:'slideOutBottom'},{l:'\u7F29\u5C0F\u6D88\u5931',v:'shrinkOut'}];

var MA=[{l:'\u65E0',v:'none'},{l:'\u8109\u51B2',v:'pulse'},{l:'\u95EA\u70C1',v:'flash'},
  {l:'\u6296\u52A8',v:'shake'},{l:'\u6446\u6446',v:'swing'},{l:'\u5FC3\u8DF3',v:'heartbeat'},
  {l:'\u65CB\u8F6C',v:'rotateEm'}];

var ST=[
  {l:'\u77E9\u5F62',v:'rect'},{l:'\u5706\u89D2\u77E9\u5F62',v:'roundRect'},{l:'\u5706\u5F62',v:'circle'},
  {l:'\u692D\u5706',v:'ellipse'},{l:'\u4E09\u89D2\u5F62',v:'triangle'},{l:'倒三角形',v:'triangleDown'},
  {l:'\u83F1\u5F62',v:'diamond'},{l:'\u4E94\u89D2\u5F62',v:'pentagon'},{l:'\u516D\u89D2\u5F62',v:'hexagon'},
  {l:'\u661F\u5F62',v:'star'},{l:'\u5FC3\u5F62',v:'heart'},
  {l:'\u7BAD\u592F\u2192',v:'arrowRight'},{l:'\u7BAD\u592F\u2190',v:'arrowLeft'},
  {l:'\u7BAD\u592F\u2191',v:'arrowUp'},{l:'\u7BAD\u592F\u2193',v:'arrowDown'},
  {l:'\u76F4\u7EBF',v:'line'},{l:'\u53CC\u7BAD\u592F\u2194',v:'doubleArrow'}
];

var TH=[
  {n:'\u6DF1\u7A7A\u84DD',bg:'#0f1729',ac:'#2c6e7e',tx:'#e8f4f8',ft:'Arial'},
  {n:'\u6697\u591C\u9ED1',bg:'#1a1a1a',ac:'#e74c3c',tx:'#ecf0f1',ft:'Arial'},
  {n:'\u68EE\u6797\u7EFF',bg:'#1b3a2e',ac:'#27ae60',tx:'#d5f5e3',ft:'Arial'},
  {n:'\u6D77\u6D0B\u84DD',bg:'#0a2540',ac:'#3498db',tx:'#d6eaf8',ft:'Arial'},
  {n:'\u65E5\u843D\u6A59',bg:'#2d1810',ac:'#e67e22',tx:'#fdebd0',ft:'Arial'},
  {n:'\u7D2B\u7F57\u5170',bg:'#1a1025',ac:'#9b59b6',tx:'#e8daef',ft:'Arial'},
  {n:'\u7EAF\u767D',bg:'#ffffff',ac:'#2980b9',tx:'#2c3e50',ft:'Arial'}
];

/* ── 工厂函数 ── */
function gid(){return'e'+Date.now().toString(36)+'-'+Math.random().toString(36).substr(2,5);}
function defSlide(idx,ti){var t=TH[ti||0];return{id:'s'+Date.now()+'-'+idx,title:'第 '+(idx+1)+' 页',bgColor:t.bg,bgImage:'',bgGradient:'',elements:[]};}
function getTheme(){return TH[_data?_data.themeIdx:0]||TH[0];}
function mkText(x,y,w,h,t){return{id:gid(),type:'text',x:x,y:y,w:w,h:h,rotation:0,opacity:1,content:'双击编辑文字',fontSize:24,fontFamily:t.ft||'Arial',fontWeight:'normal',fontStyle:'normal',textDecoration:'none',color:t.tx||'#fff',textAlign:'center',lineHeight:1.4,borderWidth:0,borderColor:'#666',borderStyle:'solid',borderRadius:0,fillBg:'transparent',shadow:{en:false,bl:4,oX:2,oY:2,c:'rgba(0,0,0,0.3)'},anim:{enter:'fadeIn',exit:'none',em:'none',delay:0,dur:500}};}
function mkShape(st,x,y,w,h,t){return{id:gid(),type:'shape',st:st,x:x,y:y,w:w,h:h,rotation:0,opacity:1,fb:t.ac||'#2c6e7e',fo:1,sc:'#fff',sw:0,shadow:{en:true,bl:6,oX:3,oY:3,c:'rgba(0,0,0,0.25)'},anim:{enter:'zoomIn',exit:'none',em:'none',delay:100,dur:400}};}
function mkImg(src,x,y,w,h){return{id:gid(),type:'image',src:src,x:x,y:y,w:w,h:h,rotation:0,opacity:1,fit:'contain',br:4,shadow:{en:true,bl:8,oX:3,oY:3,c:'rgba(0,0,0,0.3)'},anim:{enter:'fadeIn',exit:'fadeOut',em:'none',delay:200,dur:500}};}
function mkVideo(src,x,y,w,h){return{id:gid(),type:'video',src:src,x:x,y:y,w:w,h:h,rotation:0,opacity:1,br:4,shadow:{en:true,bl:8,oX:3,oY:3,c:'rgba(0,0,0,0.4)'},anim:{enter:'fadeIn',exit:'none',em:'none',delay:0,dur:500}};}
function mkAudio(src,x,y,w,h){return{id:gid(),type:'audio',src:src,x:x,y:y,w:w||200,h:h||60,rotation:0,opacity:1,br:6,fillBg:'#1e2a36',anim:{enter:'fadeIn',exit:'none',em:'none',delay:0,dur:500}};}
function mkChart(option,x,y,w,h){return{id:gid(),type:'chart',option:option,x:x,y:y,w:w,h:h,rotation:0,opacity:1,br:4,fillBg:'#1e2a36',shadow:{en:false,bl:4,oX:2,oY:2,c:'rgba(0,0,0,0.3)'},anim:{enter:'zoomIn',exit:'none',em:'none',delay:100,dur:400}};}
function mkTable(rows,cols,x,y,w,h,t){var html='<table style="width:100%;border-collapse:collapse;height:100%;"><tbody>';for(var r=0;r<rows;r++){html+='<tr>';for(var c=0;c<cols;c++){html+='<td style="border:1px solid '+(t.sc||'#5a7a82')+';padding:4px 6px;">&nbsp;</td>';}html+='</tr>';}html+='</tbody></table>';return{id:gid(),type:'table',x:x,y:y,w:w,h:h,rotation:0,opacity:1,content:html,fontSize:14,color:t.tx||'#fff',fillBg:'transparent',anim:{enter:'fadeIn',exit:'none',em:'none',delay:0,dur:400}};}

/* ── 插入新幻灯片 ── */
export function addSlideshow(){
  var bid=getActiveBlockId(),bw=bid?getBlockWidth(bid):800;
  var w=Math.min(580,bw-40),h=Math.min(380,520),x=Math.max(0,(bw-w)/2),y=getInsertY();
  var t=TH[0],s1=defSlide(0,0);
  s1.elements.push(mkText(SW*0.15,SH*0.35,SW*0.7,70,t));
  s1.elements[0].content='标题文字';s1.elements[0].fontSize=44;s1.elements[0].fontWeight='bold';
  s1.elements.push(mkText(SW*0.2,SH*0.55,SW*0.6,45,t));
  s1.elements[1].content='副标题或描述文字';s1.elements[1].fontSize=22;
  overlayImages.push({type:'slideshow',id:'oly-slide-'+Date.now()+'-'+Math.random().toString(36).substr(2,6),blockId:bid,x:x,y:y,width:w,height:h,zIndex:getNextZIndex(),rotation:0,leftPct:pxToPct(x,bw),widthPct:pxToPct(w,bw),_refWidth:bw,title:'',effect:'slide',autoplay:false,autoplayDelay:3000,loop:true,showNavigation:true,showPagination:true,speed:500,themeIdx:0,slideWidth:SW,slideHeight:SH,slides:[s1]});
  renderAll();transactRender();
}

/* ── 渲染播放视图 ── */
export function renderSlideshowContent(item,imgData){
  var w=document.createElement('div');
  w.style.cssText='width:100%;height:100%;position:relative;overflow:hidden;background:#111;border:1px solid #2c6e7e;border-radius:4px;display:flex;flex-direction:column;';
  var tb=document.createElement('div');tb.style.cssText='height:26px;background:#16213e;display:flex;align-items:center;padding:0 8px;border-bottom:1px solid #2c6e7e;font-size:11px;color:#aef0ff;gap:6px;flex-shrink:0;';
  var ic=document.createElement('span');ic.innerHTML='&#127916;';
  var ttl=document.createElement('span');ttl.textContent=imgData.title||'幻灯片';ttl.style.cssText='flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  var eb=document.createElement('span');eb.innerHTML='&#9998;';eb.title='打开编辑器';
  eb.style.cssText='cursor:pointer;font-size:13px;opacity:0.75;';
  eb.addEventListener('mousedown',function(e){e.stopPropagation();});
  eb.addEventListener('click',function(e){e.stopPropagation();openEditor(imgData);});
  var pb=document.createElement('span');pb.innerHTML='&#9654;';pb.title='全屏演示';
  pb.style.cssText='cursor:pointer;font-size:13px;color:#0a8a6e;margin-left:2px;opacity:0.85;';
  pb.addEventListener('mousedown',function(e){e.stopPropagation();});
  pb.addEventListener('click',function(e){e.stopPropagation();e.preventDefault();fullscreenPresent(imgData);});
  tb.appendChild(ic);tb.appendChild(ttl);tb.appendChild(pb);tb.appendChild(eb);

  var sc=document.createElement('div');sc.className='oly-swiper-container';sc.style.cssText='flex:1;overflow:hidden;position:relative;';
  var sw=document.createElement('div');sw.className='swiper-wrapper';
  var slides=imgData.slides||[];if(!slides.length) slides=[defSlide(0,imgData.themeIdx)];
  slides.forEach(function(s){
    var se=document.createElement('div');se.className='swiper-slide';
    se.style.cssText='width:100%;height:100%;overflow:hidden;background:'+(s.bgColor||'#0f1729')+';display:flex;align-items:center;justify-content:center;';
    if(s.bgImage){se.style.backgroundImage="url('"+s.bgImage+"')";se.style.backgroundSize='cover';se.style.backgroundPosition='center';}
    var inner=buildHTML(s,false);inner.style.width='92%';inner.style.height='88%';inner.style.position='relative';inner.style.overflow='hidden';
    se.appendChild(inner);sw.appendChild(se);
  });
  var pg=document.createElement('div');pg.className='swiper-pagination';pg.style.cssText='bottom:4px!important;';
  var pv=document.createElement('div');pv.className='swiper-button-prev';pv.style.cssText='color:#aef0ff!important;width:20px;height:20px;';
  var nx=document.createElement('div');nx.className='swiper-button-next';nx.style.cssText='color:#aef0ff!important;width:20px;height:20px;';
  sc.appendChild(sw);
  if(imgData.showPagination!==false) sc.appendChild(pg);
  if(imgData.showNavigation!==false){sc.appendChild(pv);sc.appendChild(nx);}
  w.appendChild(tb);w.appendChild(sc);item.appendChild(w);

  if(typeof Swiper==='undefined'){sc.innerHTML='<div style="color:#ee6666;text-align:center;padding:40px;">Swiper.js 未加载</div>';return;}
  requestAnimationFrame(function(){
    try{
      var cfg={el:sc,loop:imgData.loop!==false,effect:imgData.effect||'slide',speed:imgData.speed||500,grabCursor:true,keyboard:{enabled:true},mousewheel:{enabled:true,forceToAxis:true},observer:true,observeParents:true,pagination:imgData.showPagination!==false?{el:'.swiper-pagination',clickable:true}:false,navigation:imgData.showNavigation!==false?{prevEl:'.swiper-button-prev',nextEl:'.swiper-button-next'}:false};
      if(imgData.autoplay) cfg.autoplay={delay:imgData.autoplayDelay||3000,disableOnInteraction:false,pauseOnMouseEnter:true};
      if(imgData.effect==='cube') cfg.cubeEffect={shadow:true,slideShadows:true,shadowOffset:20,shadowScale:0.94};
      if(imgData.effect==='coverflow') cfg.coverflowEffect={rotate:50,stretch:0,depth:100,modifier:1,slideShadows:true};
      if(imgData.effect==='flip') cfg.flipEffect={limitRotation:true,slideShadows:true};
      if(imgData.effect==='cards') cfg.cardsEffect={perSlideOffset:8,perSlideRotate:2,rotate:true,slideShadows:true};
      item._swiperInstance=new Swiper(sc,cfg);item._swiperContainer=sc;
    }catch(e){console.error('[Swiper]',e);}
  });
  item.addEventListener('dblclick',function(e){e.preventDefault();e.stopPropagation();openEditor(imgData);});
}

/* ── 构建 HTML（渲染+预览共用）── */
function buildHTML(slide,prev){
  var c=document.createElement('div');
  c.style.cssText='position:relative;width:'+SW+'px;height:'+SH+'px;background:'+(slide.bgColor||'#0f1729')+';overflow:hidden;'+(prev?'':'transform-origin:top left;');
  if(slide.bgImage){c.style.backgroundImage="url('"+slide.bgImage+"')";c.style.backgroundSize='cover';c.style.backgroundPosition='center';}
  if(slide.bgGradient) c.style.background=slide.bgGradient;
  // 兼容旧格式：有 content 字段但无 elements 数组
  var els=slide.elements;
  if((!els||!els.length)&&slide.content){
    els=[{id:'el-legacy-'+Date.now(),type:'text',x:0,y:0,w:SW,h:SH,content:slide.content,fontSize:18,color:'#aaa',textAlign:'center',lineHeight:1.4,fillBg:'transparent',borderWidth:0,borderColor:'#666',borderStyle:'solid',borderRadius:0,rotation:0,opacity:1,fontFamily:'Arial',fontWeight:'normal',fontStyle:'normal',textDecoration:'none',shadow:{en:false,bl:4,oX:2,oY:2,c:'rgba(0,0,0,0.3)'},anim:{enter:'none',exit:'none',em:'none',delay:0,dur:500}}];
  }
  (els||[]).forEach(function(el){var d=makeDOM(el,prev);if(d)c.appendChild(d);});
  return c;
}

function makeDOM(el,prev){
  var d=document.createElement('div');d.id=el.id;d.setAttribute('data-et',el.type);
  var bs='position:absolute;left:'+el.x+'px;top:'+el.y+'px;width:'+el.w+'px;height:'+el.h+'px;opacity:'+(el.opacity!=null?el.opacity:1)+';'+(el.rotation?'transform:rotate('+el.rotation+'deg);':'')+(prev?'':'cursor:move;user-select:none;');
  if(el.type==='text'){
    d.contentEditable=!prev;d.innerHTML=el.content||'';
    bs+='color:'+(el.color||'#fff')+';font-size:'+(el.fontSize||18)+'px;font-family:"'+(el.fontFamily||'Arial')+'",sans-serif;font-weight:'+(el.fontWeight||'normal')+';font-style:'+(el.fontStyle||'normal')+';text-decoration:'+(el.textDecoration||'none')+';text-align:'+(el.textAlign||'left')+';line-height:'+(el.lineHeight||1.4)+';padding:4px 8px;box-sizing:border-box;word-wrap:break-word;overflow:hidden;background:'+(el.fillBg||'transparent')+';border:'+(el.borderWidth||0)+'px '+(el.borderStyle||'solid')+' '+(el.borderColor||'#666')+';border-radius:'+(el.borderRadius||0)+'px;';
    if(el.marginTop)bs+='margin-top:'+el.marginTop+'px;';
    if(el.marginBottom)bs+='margin-bottom:'+el.marginBottom+'px;';
    if(el.textLastAlign)bs+='text-align-last:'+el.textLastAlign+';';
    if(el.dropCap)d.className='ss-dropcap';
    appShadow(d,el.shadow);
  }else if(el.type==='shape'){
    d.innerHTML=svgShape(el.st,el.fb,el.sc,el.sw,el.fo);bs+='padding:0;overflow:hidden;';
  }else if(el.type==='image'){
    var im=document.createElement('img');im.src=el.src||'';im.draggable=false;
    im.style.cssText='width:100%;height:100%;object-fit:'+(el.fit||'contain')+';border-radius:'+(el.br||0)+'px;pointer-events:none;';
    d.appendChild(im);bs+='padding:0;overflow:hidden;background:rgba(255,255,255,0.03);';appShadow(d,el.shadow);
  }else if(el.type==='video'){
    var v=document.createElement('video');v.src=el.src||'';v.draggable=false;v.controls=true;
    v.style.cssText='width:100%;height:100%;object-fit:contain;border-radius:'+(el.br||0)+'px;pointer-events:auto;background:#000;';
    d.appendChild(v);bs+='padding:0;overflow:hidden;background:#000;';appShadow(d,el.shadow);
  }else if(el.type==='audio'){
    var a=document.createElement('audio');a.src=el.src||'';a.controls=true;
    a.style.cssText='width:100%;pointer-events:auto;';
    var ph=document.createElement('div');ph.style.cssText='display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;gap:6px;background:'+(el.fillBg||'#1e2a36')+';border-radius:'+(el.br||6)+'px;color:#aef0ff;';
    var ic=document.createElement('div');ic.style.cssText='font-size:32px;line-height:1;';ic.textContent='🎵';
    ph.appendChild(ic);ph.appendChild(a);d.appendChild(ph);bs+='padding:8px;box-sizing:border-box;';
  }else if(el.type==='chart'){
    var cv=document.createElement('div');cv.style.cssText='width:100%;height:100%;background:'+(el.fillBg||'#1e2a36')+';border-radius:'+(el.br||4)+'px;';
    d.appendChild(cv);bs+='padding:0;overflow:hidden;';appShadow(d,el.shadow);
    if(!prev&&window.echarts){var ch=window.echarts.init(cv);ch.setOption(el.option||{});el._chart=ch;}
  }else if(el.type==='table'){
    d.contentEditable=!prev;d.innerHTML=el.content||'';bs+='color:'+(el.color||'#fff')+';font-size:'+(el.fontSize||14)+'px;padding:4px 8px;box-sizing:border-box;overflow:auto;background:'+(el.fillBg||'transparent')+';';
  }
  d.style.cssText=bs;return d;
}

function appShadow(d,s){if(s&&s.en)d.style.boxShadow=s.oX+'px '+s.oY+'px '+s.bl+'px '+(s.c||'rgba(0,0,0,0.3)');}

function svgShape(t,f,sc,sw,fo){
  var S='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%;display:block;">',E='</svg>';
  var m={
    rect:'<rect x="2" y="2" width="96" height="96" rx="2" fill="'+f+'" fill-opacity="'+fo+'" stroke="'+sc+'" stroke-width="'+sw+'"/>',
    roundRect:'<rect x="2" y="2" width="96" height="96" rx="14" fill="'+f+'" fill-opacity="'+fo+'" stroke="'+sc+'" stroke-width="'+sw+'"/>',
    circle:'<ellipse cx="50" cy="50" rx="48" ry="48" fill="'+f+'" fill-opacity="'+fo+'" stroke="'+sc+'" stroke-width="'+sw+'"/>',
    ellipse:'<ellipse cx="50" cy="50" rx="46" ry="32" fill="'+f+'" fill-opacity="'+fo+'" stroke="'+sc+'" stroke-width="'+sw+'"/>',
    triangle:'<polygon points="50,4 96,96 4,96" fill="'+f+'" fill-opacity="'+fo+'" stroke="'+sc+'" stroke-width="'+sw+'"/>',
    triangleDown:'<polygon points="50,96 96,4 4,4" fill="'+f+'" fill-opacity="'+fo+'" stroke="'+sc+'" stroke-width="'+sw+'"/>',
    diamond:'<polygon points="50,4 96,50 50,96 4,50" fill="'+f+'" fill-opacity="'+fo+'" stroke="'+sc+'" stroke-width="'+sw+'"/>',
    pentagon:'<polygon points="50,4 96,38 78,96 22,96 4,38" fill="'+f+'" fill-opacity="'+fo+'" stroke="'+sc+'" stroke-width="'+sw+'"/>',
    hexagon:'<polygon points="50,4 90,27 90,73 50,96 10,73 10,27" fill="'+f+'" fill-opacity="'+fo+'" stroke="'+sc+'" stroke-width="'+sw+'"/>',
    star:'<polygon points="50,4 61,38 98,38 68,61 79,95 50,74 21,95 32,61 2,38 39,38" fill="'+f+'" fill-opacity="'+fo+'" stroke="'+sc+'" stroke-width="'+sw+'"/>',
    heart:'<path d="M50,88 C20,60 4,40 4,26 C4,10 18,2 32,2 C42,2 48,10 50,14 C52,10 58,2 68,2 C82,2 96,10 96,26 C96,40 80,60 50,88Z" fill="'+f+'" fill-opacity="'+fo+'" stroke="'+sc+'" stroke-width="'+sw+'"/>',
    arrowRight:'<polygon points="8,30 8,70 65,70 65,86 96,50 65,14 65,30" fill="'+f+'" fill-opacity="'+fo+'" stroke="'+sc+'" stroke-width="'+sw+'"/>',
    arrowLeft:'<polygon points="92,30 92,70 35,70 35,86 4,50 35,14 35,30" fill="'+f+'" fill-opacity="'+fo+'" stroke="'+sc+'" stroke-width="'+sw+'"/>',
    arrowUp:'<polygon points="30,92 70,92 70,35 86,35 50,4 14,35 30,35" fill="'+f+'" fill-opacity="'+fo+'" stroke="'+sc+'" stroke-width="'+sw+'"/>',
    arrowDown:'<polygon points="30,8 70,8 70,65 86,65 50,96 14,65 30,65" fill="'+f+'" fill-opacity="'+fo+'" stroke="'+sc+'" stroke-width="'+sw+'"/>',
    line:'<line x1="4" y1="50" x2="96" y2="50" stroke="'+f+'" stroke-width="4" stroke-linecap="round"/>',
    doubleArrow:'<polygon points="4,44 4,56 35,56 35,72 50,84 65,72 65,56 96,56 96,44 65,44 65,28 50,16 35,28 35,44" fill="'+f+'" fill-opacity="'+fo+'" stroke="'+sc+'" stroke-width="'+sw+'"/>'};
  return S+(m[t]||m.rect)+E;
}

/* ── 全屏演示 ── */
function fullscreenPresent(imgData){
  var ov=document.createElement('div');ov.id='pptFS';
  ov.style.cssText='position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:99999;background:#000;display:flex;flex-direction:column;cursor:pointer;';
  var cb=document.createElement('div');cb.style.cssText='height:36px;background:#111;display:flex;align-items:center;padding:0 16px;gap:10px;border-bottom:1px solid #222;flex-shrink:0;';
  var pi=document.createElement('span');pi.style.cssText='color:#aef0ff;font-size:12px;flex:1;';
  var xb=document.createElement('button');xb.textContent='退出演示 (ESC)';
  xb.style.cssText='padding:4px 14px;border:1px solid #2c6e7e;border-radius:3px;background:transparent;color:#aef0ff;cursor:pointer;font-size:11px;';
  xb.addEventListener('mousedown',function(e){e.stopPropagation();});
  xb.addEventListener('click',function(e){e.stopPropagation();e.preventDefault();cleanup();});
  cb.appendChild(pi);cb.appendChild(xb);
  var sa=document.createElement('div');sa.style.cssText='flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;';
  ov.appendChild(cb);ov.appendChild(sa);document.body.appendChild(ov);

  var slides=imgData.slides||[];if(!slides.length) slides=[defSlide(0)];
  var cp=0,st=null;

  function showPage(i){
    if(i<0||i>=slides.length)return;cp=i;if(st)st.remove();
    var sl=slides[i];st=buildHTML(sl,true);
    st.style.maxWidth='92vw';st.style.maxHeight='84vh';st.style.transition='transform 0.4s ease, opacity 0.4s ease';
    sa.appendChild(st);
    var els=st.querySelectorAll('[data-et]');
    els.forEach(function(dom,j){
      var ed=sl.elements[j];if(!ed||!ed.anim||ed.anim.enter==='none')return;
      dom.style.opacity='0';dom.style.transform=animInit(ed.anim.enter);
      setTimeout(function(){
        dom.style.transition='opacity '+(ed.anim.dur||500)+'ms ease, transform '+(ed.anim.dur||500)+'ms ease';
        dom.style.opacity=String(ed.opacity!=null?ed.opacity:1);dom.style.transform=(ed.rotation?'rotate('+ed.rotation+'deg)':'');
      },ed.anim.delay||(j*150));
    });
    pi.textContent=(i+1)+' / '+slides.length+(sl.title?' — '+sl.title:'');
  }

  function animInit(n){var m={fadeIn:'scale(0.95)',slideInLeft:'translateX(-40px)',slideInRight:'translateX(40px)',slideInTop:'translateY(-40px)',slideInBottom:'translateY(40px)',zoomIn:'scale(0.3)',zoomOut:'scale(2)',bounceIn:'scale(0.5)',flipIn:'perspective(600px) rotateY(90deg)',rotateIn:'rotate(-180deg) scale(0.5)'};return m[n]||'scale(0.95)';}
  function cleanup(){document.removeEventListener('keydown',kh);document.body.removeChild(ov);}
  function kh(e){
    if(e.key==='Escape')cleanup();
    else if((e.key==='ArrowRight'||e.key==='ArrowDown'||e.key===' ')&&!e.ctrlKey&&!e.altKey){e.preventDefault();if(cp<slides.length-1)showPage(cp+1);}
    else if((e.key==='ArrowLeft'||e.key==='ArrowUp')&&!e.ctrlKey&&!e.altKey){e.preventDefault();if(cp>0)showPage(cp-1);}
    else if(e.key==='Home'){e.preventDefault();showPage(0);}else if(e.key==='End'){e.preventDefault();showPage(slides.length-1);}
  }
  ov.addEventListener('click',function(e){if(e.target===ov||e===sa){if(cp<slides.length-1)showPage(cp+1);else cleanup();}});
  document.addEventListener('keydown',kh);showPage(0);
}

/* ════════════════════════════════════════
   编辑器
   ════════════════════════════════════════ */

var _modal=null,_data=null,_selId=null,_cscale=1,_dragging=false,_resizing=false,_ds=null,_rh=null;
var _escHandler=null,_khHandler=null;

export function openEditor(imgData){
  _data=imgData;_selId=null;
  // 从数据恢复幻灯片尺寸，避免跨实例污染
  SW=_data.slideWidth||960;SH=_data.slideHeight||540;
  if(!_modal){_modal=document.createElement('div');_modal.id='ssEditor';
    _modal.style.cssText='position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:99999;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);font-family:Arial,sans-serif;';
    var ssStyle=document.createElement('style');ssStyle.textContent='.ss-emphasis{text-emphasis:filled dot;-webkit-text-emphasis:filled dot;text-emphasis-position:under right;-webkit-text-emphasis-position:under right;}.ss-dropcap::first-letter{float:left;font-size:2.6em;line-height:0.85;padding:2px 6px 0 0;font-weight:bold;}';
    document.head.appendChild(ssStyle);
    document.body.appendChild(_modal);}
  _modal.innerHTML='';_modal.style.display='flex';buildUI(_modal,imgData);
  _modal.addEventListener('mousedown',function(e){if(e.target===_modal)closeEd();});
  // 移除旧的 ESC 监听器（如有）
  if(_escHandler){document.removeEventListener('keydown',_escHandler);}
  _escHandler=function(e){if(e.key==='Escape'){closeEd();}};
  document.addEventListener('keydown',_escHandler);
}

function closeEd(){if(_escHandler){document.removeEventListener('keydown',_escHandler);_escHandler=null;}if(_khHandler){document.removeEventListener('keydown',_khHandler);_khHandler=null;}if(_modal)_modal.style.display='none';stopSlideDraw();if(_drawCanvas&&_drawCanvas.parentNode)_drawCanvas.parentNode.removeChild(_drawCanvas);_drawCanvas=null;_drawCtx=null;_data=null;_selId=null;}
export { openEditor as openSlideshowEditor };
function saveAndClose(){if(_data){var orig=overlayImages.find(function(im){return im.id===_data.id;});if(orig)Object.assign(orig,_data);renderAll();}transactRender();closeEd();}

var _activeTab='home',_drawCanvas=null,_drawCtx=null,_drawActive=false,_drawTool='pen',_drawColor='#aef0ff',_drawSize=3,_drawLineStyle='solid',_drawHistory=[],_drawHistoryIdx=-1,_drawIsDrawing=false,_drawLastX=0,_drawLastY=0,_drawRainbowHue=0,_drawTempCanvas=null,_drawTempCtx=null;
var _undoStack=[],_redoStack=[],_UNDO_MAX=50;

function buildUI(ctn,d){
  var main=document.createElement('div');
  main.style.cssText='width:96vw;height:94vh;max-width:1600px;max-height:960px;background:#0a1418;border-radius:10px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 12px 48px rgba(0,0,0,0.6);';

  var titleBar=document.createElement('div');
  titleBar.style.cssText='height:34px;background:#0a1418;display:flex;align-items:center;padding:0 12px;border-bottom:1px solid #2c6e7e;gap:8px;flex-shrink:0;';
  titleBar.innerHTML='\u{1F3AC} ';
  var ti=document.createElement('input');ti.type='text';ti.value=d.title||'';ti.placeholder='幻灯片标题...';
  ti.style.cssText='background:transparent;border:1px solid transparent;color:#aef0ff;font-size:13px;font-weight:bold;padding:3px 8px;border-radius:4px;outline:none;width:200px;';
  ti.addEventListener('focus',function(){ti.style.borderColor='#2c6e7e';});
  ti.addEventListener('blur',function(){ti.style.borderColor='transparent';d.title=ti.value;});
  titleBar.appendChild(ti);
  var sp=document.createElement('div');sp.style.flex='1';titleBar.appendChild(sp);
  titleBar.appendChild(mkSmBtn('撤销↶','#5a7a82',undo));
  titleBar.appendChild(mkSmBtn('重做↷','#5a7a82',redo));
  titleBar.appendChild(mkSmBtn('保存','#0a8a6e',saveAndClose));
  titleBar.appendChild(mkSmBtn('导出','#2980b9',function(){exportPptx(d);}));
  titleBar.appendChild(mkSmBtn('PDF','#c0392b',function(){exportPdf(d);}));
  titleBar.appendChild(mkSmBtn('✕','#555',closeEd));
  main.appendChild(titleBar);

  var tabBar=document.createElement('div');
  tabBar.style.cssText='display:flex;background:#0a1418;border-bottom:1px solid #2c6e7e;flex-shrink:0;';
  var tabs=['home','insert','design','draw','transition','animation'];
  var tabLabels={home:'开始',insert:'插入',design:'设计',draw:'绘图',transition:'切换',animation:'动画'};
  tabs.forEach(function(tid){
    var tb=document.createElement('div');tb.className='ss-tab-'+tid;
    tb.style.cssText='padding:7px 22px;cursor:pointer;font-size:12px;color:'+(tid===_activeTab?'#aef0ff':'#5a7a82')+';border-bottom:'+(tid===_activeTab?'2px solid #2c7a6e':'2px solid transparent')+';transition:color 0.15s,border-color 0.15s;user-select:none;';
    tb.textContent=tabLabels[tid];
    tb.addEventListener('click',function(){switchTab(tid);});
    tb.addEventListener('mouseenter',function(){if(tid!==_activeTab)tb.style.color='#aef0ff88';});
    tb.addEventListener('mouseleave',function(){if(tid!==_activeTab)tb.style.color='#5a7a82';});
    tabBar.appendChild(tb);
  });
  main.appendChild(tabBar);

  var ribbonWrap=document.createElement('div');ribbonWrap.id='ssRibbon';
  ribbonWrap.style.cssText='min-height:84px;max-height:120px;background:#0f1e26;border-bottom:1px solid #2c6e7e;display:flex;align-items:stretch;padding:2px 6px;gap:0;flex-shrink:0;overflow-x:auto;overflow-y:hidden;';
  main.appendChild(ribbonWrap);

  var bodyWrap=document.createElement('div');bodyWrap.style.cssText='flex:1;display:flex;overflow:hidden;min-height:0;';
  bodyWrap.appendChild(thumbPanel(d));
  bodyWrap.appendChild(canvasPanel(d));
  main.appendChild(bodyWrap);

  var statusBar=document.createElement('div');statusBar.id='ssStatusBar';
  statusBar.style.cssText='height:24px;background:#0a1418;display:flex;align-items:center;padding:0 12px;border-top:1px solid #2c6e7e;gap:12px;flex-shrink:0;font-size:11px;color:#5a7a82;';
  main.appendChild(statusBar);

  ctn.appendChild(main);
  switchTab(_activeTab);
  setTimeout(function(){updateCS();refreshThumbs();updateStatusBar();},100);
}

function switchTab(tid){
  _activeTab=tid;
  var tabs=['home','insert','design','draw','transition','animation'];
  tabs.forEach(function(t){
    var el=document.querySelector('.ss-tab-'+t);if(!el)return;
    el.style.color=t===tid?'#aef0ff':'#5a7a82';
    el.style.borderBottom=t===tid?'2px solid #2c7a6e':'2px solid transparent';
  });
  if(tid==='draw')startSlideDraw();else stopSlideDraw();
  var rb=document.getElementById('ssRibbon');if(!rb)return;rb.innerHTML='';
  if(tid==='home')rb.appendChild(ribbonHome());
  else if(tid==='insert')rb.appendChild(ribbonInsert());
  else if(tid==='design')rb.appendChild(ribbonDesign());
  else if(tid==='draw')rb.appendChild(ribbonDraw());
  else if(tid==='transition')rb.appendChild(ribbonTransition());
  else if(tid==='animation')rb.appendChild(ribbonAnimation());
}

function mkSmBtn(l,col,fn){var b=document.createElement('button');b.textContent=l;b.style.cssText='padding:3px 10px;border:1px solid '+col+';border-radius:3px;background:transparent;color:'+col+';cursor:pointer;font-size:11px;transition:all 0.15s;';b.addEventListener('mouseenter',function(){b.style.background=col;b.style.color='#fff';});b.addEventListener('mouseleave',function(){b.style.background='transparent';b.style.color=col;});b.addEventListener('click',fn);return b;}

function mkRBtn(label,icon,fn,active){var b=document.createElement('button');b.innerHTML=(icon?'<span style=\'font-size:14px;margin-right:3px;\'>'+icon+'</span>':'')+label;var act=!!active;b.style.cssText='padding:4px 8px;border:none;border-radius:3px;background:'+(act?'#2c7a6e':'transparent')+';color:'+(act?'#fff':'#aef0ff')+';cursor:pointer;font-size:11px;white-space:nowrap;transition:background 0.12s,color 0.12s;display:flex;align-items:center;gap:3px;flex-shrink:0;';b.addEventListener('mouseenter',function(){b.style.background=act?'#2c7a6e':'#1c525a';b.style.color='#fff';});b.addEventListener('mouseleave',function(){b.style.background=act?'#2c7a6e':'transparent';b.style.color=act?'#fff':'#aef0ff';});b.addEventListener('mousedown',function(e){e.stopPropagation();});b.addEventListener('click',function(e){e.stopPropagation();e.preventDefault();if(fn)fn();});return b;}

function mkRGroup(label){var g=document.createElement('div');g.style.cssText='display:flex;align-items:center;gap:2px;padding:0 4px;flex-shrink:0;flex-wrap:nowrap;';return g;}

function mkRSep(){var s=document.createElement('div');s.style.cssText='width:1px;height:24px;background:#1c3a42;margin:0 3px;flex-shrink:0;';return s;}

function mkRCol(){var c=document.createElement('div');c.style.cssText='display:flex;flex-direction:column;justify-content:center;gap:2px;padding:0 6px;border-right:1px solid #1c3a42;flex-shrink:0;';return c;}

function mkRRow(){var r=document.createElement('div');r.style.cssText='display:flex;align-items:center;gap:2px;flex-wrap:nowrap;flex-shrink:0;';return r;}

function mkRBtnV(icon,label,fn,active){var b=document.createElement('button');var act=!!active;b.style.cssText='padding:4px 4px 0;border:none;border-radius:3px;background:'+(act?'#2c7a6e':'transparent')+';color:'+(act?'#fff':'#aef0ff')+';cursor:pointer;font-size:10px;line-height:1.3;width:50px;min-width:50px;height:64px;min-height:64px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:2px;flex-shrink:0;transition:background 0.12s,color 0.12s;';var ic=document.createElement('div');ic.style.cssText='font-size:22px;line-height:1;width:28px;height:28px;display:flex;align-items:center;justify-content:center;flex-shrink:0;';ic.textContent=icon||'';b.appendChild(ic);var lb=document.createElement('div');lb.style.cssText='text-align:center;width:100%;';lb.textContent=label||'';b.appendChild(lb);b.addEventListener('mouseenter',function(){b.style.background=act?'#2c7a6e':'#1c525a';b.style.color='#fff';});b.addEventListener('mouseleave',function(){b.style.background=act?'#2c7a6e':'transparent';b.style.color=act?'#fff':'#aef0ff';});b.addEventListener('mousedown',function(e){e.stopPropagation();});b.addEventListener('click',function(e){e.stopPropagation();e.preventDefault();if(fn)fn();});return b;}

function mkRSelect(opts,val,fn){var s=document.createElement('select');opts.forEach(function(o){var op=document.createElement('option');if(typeof o==='object'){op.value=o.v;op.textContent=o.l;}else{op.value=o;op.textContent=o;}if((typeof o==='object'?o.v:o)===val)op.selected=true;s.appendChild(op);});s.style.cssText='background:#0a1418;border:1px solid #2c6e7e;color:#aef0ff;font-size:11px;padding:3px 4px;border-radius:3px;outline:none;max-width:90px;flex-shrink:0;';s.addEventListener('change',function(){fn(s.value);});s.addEventListener('mousedown',function(e){e.stopPropagation();});return s;}

function updateStatusBar(){
  var sb=document.getElementById('ssStatusBar');if(!sb||!_data)return;
  var idx=curIdx(),total=_data.slides?_data.slides.length:0;
  var el=_selId?findEl(_selId):null;
  var info='第 '+(idx+1)+' / '+total+' 页';
  if(el){var tn={text:'文本框',image:'图片',shape:'形状'};info+=' | 选中: '+(tn[el.type]||'元素');}
  if(_drawActive)info+=' | 🖌 绘图模式 ('+_drawTool+')';
  sb.textContent=info;
}

function ribbonHome(){
  var wrap=document.createElement('div');wrap.style.cssText='display:flex;align-items:stretch;gap:0;width:100%;';
  var el=_selId?findEl(_selId):null;
  var editing=isTextEditing();

  // ════ 第1大列：字体（两行）════
  var colFont=mkRCol();
  // 行1：中文字体 · 英文字体 · 字号 · A▲ · A▼ · 间距 · 大小写 · 清除 · □
  var r1=mkRRow();
  var cnSel=mkRSelect([{v:'',l:'中文字体'}].concat(CN_FONTS.map(function(f){return{v:f.family,l:f.label};})),'',function(v){if(v){if(editing)execTextCmd('fontName',v);else applyProp('fontFamily',v);}});
  cnSel.style.maxWidth='92px';r1.appendChild(cnSel);
  var enSel=mkRSelect([{v:'',l:'英文字体'}].concat(EN_FONTS.map(function(f){return{v:f.family,l:f.label};})),'',function(v){if(v){if(editing)execTextCmd('fontName',v);else applyProp('fontFamily',v);}});
  enSel.style.maxWidth='92px';r1.appendChild(enSel);
  var sizeOpts=[10,12,14,16,18,20,24,28,32,36,44,56,72];
  r1.appendChild(mkRSelect(sizeOpts.map(function(s){return{v:s,l:s+'px'}}),el&&el.fontSize?el.fontSize:24,function(v){if(editing)execTextFontSize(parseInt(v));else applyProp('fontSize',parseInt(v));}));
  r1.appendChild(mkRBtn('A▲','',function(){var t=getEditTarget();if(t){execTextCmd('increaseFontSize');}else if(el&&el.fontSize){applyProp('fontSize',el.fontSize+2);}},false));
  r1.appendChild(mkRBtn('A▼','',function(){var t=getEditTarget();if(t){execTextCmd('decreaseFontSize');}else if(el&&el.fontSize){applyProp('fontSize',Math.max(8,el.fontSize-2));}},false));
  r1.appendChild(mkRSep());
  var spaceBtn=mkRBtn('间距','',function(){showCharSpacingMenu();},false);spaceBtn.title='字间距';r1.appendChild(spaceBtn);
  var caseBtn=mkRBtn('Aa','',function(){showCaseMenu();},false);caseBtn.title='大小写';r1.appendChild(caseBtn);
  r1.appendChild(mkRBtn('清除','',function(){var t=getEditTarget();if(t){execTextCmd('removeFormat');var e=findEl(_selId);if(e)e.content=t.innerHTML;}else{clearElProps(el);}},false));
  var borderBtn=mkRBtn('□','',function(){var sp=document.createElement('span');sp.style.border='1px solid currentColor';sp.style.padding='0 2px';wrapSelection(sp);var t=getEditTarget();if(t&&_selId){var e=findEl(_selId);if(e)e.content=t.innerHTML;}},false);borderBtn.title='字符边框';r1.appendChild(borderBtn);
  colFont.appendChild(r1);
  // 行2：B · I · U · S · ● · X² · X₂ · 文字色 · 背景色 · 简 · 繁 · 拼
  var r2=mkRRow();
  r2.appendChild(mkRBtn('B','',function(){var t=getEditTarget();if(t){execTextCmd('bold');}else toggleProp('fontWeight','bold','normal');},editing||(el&&el.fontWeight==='bold')));
  r2.appendChild(mkRBtn('I','',function(){var t=getEditTarget();if(t){execTextCmd('italic');}else toggleProp('fontStyle','italic','normal');},editing||(el&&el.fontStyle==='italic')));
  r2.appendChild(mkRBtn('U','',function(){var t=getEditTarget();if(t){execTextCmd('underline');}else toggleProp('textDecoration','underline','none');},editing||(el&&el.textDecoration==='underline')));
  r2.appendChild(mkRBtn('S','',function(){var t=getEditTarget();if(t){execTextCmd('strikeThrough');}else toggleProp('textDecoration','line-through','none');},editing||(el&&el.textDecoration==='line-through')));
  r2.appendChild(mkRSep());
  var empBtn=mkRBtn('●','',function(){applyCharClass('ss-emphasis');},false);empBtn.title='着重号';r2.appendChild(empBtn);
  r2.appendChild(mkRSep());
  r2.appendChild(mkRBtn('X²','',function(){var t=getEditTarget();if(t){execTextCmd('superscript');}},false));
  r2.appendChild(mkRBtn('X₂','',function(){var t=getEditTarget();if(t){execTextCmd('subscript');}},false));
  r2.appendChild(mkRSep());
  var tcBtn=document.createElement('button');tcBtn.innerHTML='<span style=\'font-size:13px;\'>A</span><span style=\'display:inline-block;width:12px;height:3px;background:'+(el?el.color||'#fff':'#fff')+';margin-left:2px;vertical-align:middle;\'></span>';
  tcBtn.style.cssText='padding:4px 8px;border:none;border-radius:3px;background:transparent;color:#aef0ff;cursor:pointer;font-size:11px;flex-shrink:0;';
  tcBtn.addEventListener('mouseenter',function(){tcBtn.style.background='#1c525a';tcBtn.style.color='#fff';});
  tcBtn.addEventListener('mouseleave',function(){tcBtn.style.background='transparent';tcBtn.style.color='#aef0ff';});
  tcBtn.addEventListener('click',function(e){e.stopPropagation();var inp=document.createElement('input');inp.type='color';inp.value=el?el.color||'#ffffff':'#ffffff';inp.style.cssText='position:absolute;opacity:0;pointer-events:none;';document.body.appendChild(inp);inp.addEventListener('input',function(){if(editing)execTextCmd('foreColor',inp.value);else applyProp('color',inp.value);tcBtn.querySelector('span:last-child').style.background=inp.value;});inp.click();setTimeout(function(){if(inp.parentNode)document.body.removeChild(inp);},30000);});
  tcBtn.addEventListener('mousedown',function(e){e.stopPropagation();});
  tcBtn.title='文字颜色';r2.appendChild(tcBtn);
  var bgBtn=document.createElement('button');bgBtn.textContent='背景色';bgBtn.style.cssText='padding:4px 8px;border:none;border-radius:3px;background:transparent;color:#aef0ff;cursor:pointer;font-size:11px;flex-shrink:0;';
  bgBtn.addEventListener('mouseenter',function(){bgBtn.style.background='#1c525a';bgBtn.style.color='#fff';});
  bgBtn.addEventListener('mouseleave',function(){bgBtn.style.background='transparent';bgBtn.style.color='#aef0ff';});
  bgBtn.addEventListener('click',function(e){e.stopPropagation();var inp=document.createElement('input');inp.type='color';inp.value=el&&el.fillBg&&el.fillBg!=='transparent'?el.fillBg:'#000000';inp.style.cssText='position:absolute;opacity:0;pointer-events:none;';document.body.appendChild(inp);inp.addEventListener('input',function(){if(editing)execTextCmd('hiliteColor',inp.value);else applyProp('fillBg',inp.value);});inp.click();setTimeout(function(){if(inp.parentNode)document.body.removeChild(inp);},30000);});
  bgBtn.addEventListener('mousedown',function(e){e.stopPropagation();});
  bgBtn.title='背景色';r2.appendChild(bgBtn);
  r2.appendChild(mkRSep());
  var simpBtn=mkRBtn('简','',function(){convertCase('simplify');},false);simpBtn.title='繁转简';r2.appendChild(simpBtn);
  var tradBtn=mkRBtn('繁','',function(){convertCase('traditional');},false);tradBtn.title='简转繁';r2.appendChild(tradBtn);
  var pinyinBtn=mkRBtn('拼','',function(){addPinyin();},false);pinyinBtn.title='拼音';r2.appendChild(pinyinBtn);
  colFont.appendChild(r2);
  wrap.appendChild(colFont);

  // ════ 第2大列：段落（两行）════
  var colPara=mkRCol();
  // 行1：• · 1. · ⇤ · ⇥ · 首沉
  var r3=mkRRow();
  r3.appendChild(mkRBtn('•','',function(){var t=getEditTarget();if(t){execTextCmd('insertUnorderedList');}},false));
  r3.appendChild(mkRBtn('1.','',function(){var t=getEditTarget();if(t){execTextCmd('insertOrderedList');}},false));
  r3.appendChild(mkRBtn('⇤','',function(){var t=getEditTarget();if(t){execTextCmd('outdent');}},false));
  r3.appendChild(mkRBtn('⇥','',function(){var t=getEditTarget();if(t){execTextCmd('indent');}},false));
  r3.appendChild(mkRSep());
  r3.appendChild(mkRBtn('首沉','',function(){toggleDropCap();},el&&el.dropCap));
  colPara.appendChild(r3);
  // 行2：⫷ · ⫸ · ⫹ · ☰ · 分散 · 行距 · 段距 · 引用 · —
  var r4=mkRRow();
  [{l:'⫷',v:'left'},{l:'⫸',v:'center'},{l:'⫹',v:'right'},{l:'☰',v:'justify'}].forEach(function(a){
    r4.appendChild(mkRBtn(a.l,'',function(){applyProp('textAlign',a.v);},el&&el.textAlign===a.v));
  });
  r4.appendChild(mkRBtn('分散','',function(){applyProp('textAlign','justify');applyProp('textLastAlign','justify');},el&&el.textLastAlign==='justify'));
  r4.appendChild(mkRSep());
  var lhOpts=[{v:'1',l:'1.0'},{v:'1.2',l:'1.2'},{v:'1.4',l:'1.4'},{v:'1.6',l:'1.6'},{v:'2',l:'2.0'},{v:'2.5',l:'2.5'},{v:'3',l:'3.0'}];
  r4.appendChild(mkRSelect(lhOpts,el?String(el.lineHeight||1.4):'1.4',function(v){applyProp('lineHeight',parseFloat(v));}));
  r4.appendChild(mkRBtn('段距','',function(){showParaSpacingDialog();}));
  r4.appendChild(mkRSep());
  r4.appendChild(mkRBtn('引用','',function(){var t=getEditTarget();if(t){execTextCmd('formatBlock','blockquote');}},false));
  r4.appendChild(mkRBtn('—','',function(){var t=getEditTarget();if(t){execTextCmd('insertHorizontalRule');}},false));
  colPara.appendChild(r4);
  wrap.appendChild(colPara);

  // ════ 第3大列：编辑（单行）════
  var colEdit=mkRCol();
  var r5=mkRRow();
  r5.appendChild(mkRBtn('查找','',function(){showFindReplace();},false));
  r5.appendChild(mkRBtn('全选','',function(){var t=getEditTarget();if(t){var r=document.createRange();r.selectNodeContents(t);var s=window.getSelection();s.removeAllRanges();s.addRange(r);}else{selEl(null);}}));
  r5.appendChild(mkRSep());
  r5.appendChild(mkRBtn('复制','📋',function(){dupSel();}));
  r5.appendChild(mkRBtn('删除','🗑',function(){delSel();}));
  r5.appendChild(mkRBtn('上移','⬆',function(){moveLayer(-1);}));
  r5.appendChild(mkRBtn('下移','⬇',function(){moveLayer(1);}));
  colEdit.appendChild(r5);
  wrap.appendChild(colEdit);

  var colAlign=mkRCol();
  var r6=mkRRow();
  r6.appendChild(mkRBtn('左对齐','',function(){alignEl('left');}));
  r6.appendChild(mkRBtn('水平居中','',function(){alignEl('hcenter');}));
  r6.appendChild(mkRBtn('右对齐','',function(){alignEl('right');}));
  r6.appendChild(mkRBtn('顶部','',function(){alignEl('top');}));
  r6.appendChild(mkRBtn('垂直居中','',function(){alignEl('vcenter');}));
  r6.appendChild(mkRBtn('底部','',function(){alignEl('bottom');}));
  colAlign.appendChild(r6);
  var r7=mkRRow();
  r7.appendChild(mkRBtn('横向分布','',function(){distributeEl('h');}));
  r7.appendChild(mkRBtn('纵向分布','',function(){distributeEl('v');}));
  colAlign.appendChild(r7);
  wrap.appendChild(colAlign);

  return wrap;
}

function alignEl(mode){
  var el=_selId?findEl(_selId):null;if(!el){alert('请先选中一个元素');return;}
  pushUndo();
  if(mode==='left')el.x=0;
  else if(mode==='right')el.x=SW-el.w;
  else if(mode==='hcenter')el.x=Math.round((SW-el.w)/2);
  else if(mode==='top')el.y=0;
  else if(mode==='bottom')el.y=SH-el.h;
  else if(mode==='vcenter')el.y=Math.round((SH-el.h)/2);
  renderCanvas();showSelBox(el.id);
}
function distributeEl(axis){
  if(!_data)return;var sl=_data.slides[curIdx()];if(!sl)return;
  var els=(sl.elements||[]).slice().sort(function(a,b){return axis==='h'?(a.x-b.x):(a.y-b.y);});
  if(els.length<3){alert('分布至少需要3个元素');return;}
  pushUndo();
  var first=els[0],last=els[els.length-1];
  if(axis==='h'){var total=last.x-first.x;var step=total/(els.length-1);for(var i=1;i<els.length-1;i++){els[i].x=first.x+Math.round(step*i);}}
  else{var total=last.y-first.y;var step=total/(els.length-1);for(var i=1;i<els.length-1;i++){els[i].y=first.y+Math.round(step*i);}}
  renderCanvas();
}

function applyCharClass(cls){
  var t=getEditTarget();if(!t)return;
  var sel=window.getSelection();if(!sel.rangeCount||sel.isCollapsed)return;
  var rng=sel.getRangeAt(0);
  var sp=document.createElement('span');sp.className=cls;
  try{rng.surroundContents(sp);var el=findEl(_selId);if(el)el.content=t.innerHTML;}catch(e){}
}
function showCharSpacingMenu(){
  var opts=[{v:'0',l:'默认'},{v:'1px',l:'紧凑'},{v:'2px',l:'稀疏'},{v:'4px',l:'很稀疏'},{v:'8px',l:'超稀疏'}];
  showInlineMenu(opts,function(v){var t=getEditTarget();if(!t)return;var sp=document.createElement('span');sp.style.letterSpacing=v;wrapSelection(sp);if(_selId){var el=findEl(_selId);if(el)el.content=t.innerHTML;}});
}
function showCaseMenu(){
  var opts=[{v:'upper',l:'大写'},{v:'lower',l:'小写'},{v:'title',l:'首字母大写'},{v:'sentence',l:'句首大写'}];
  showInlineMenu(opts,function(v){convertCase(v);});
}
function convertCase(type){
  var t=getEditTarget();if(!t)return;var sel=window.getSelection();if(!sel.rangeCount||sel.isCollapsed)return;
  var rng=sel.getRangeAt(0);
  var fn;
  if(type==='upper')fn=function(s){return s.toUpperCase();};
  else if(type==='lower')fn=function(s){return s.toLowerCase();};
  else if(type==='title')fn=function(s){return s.replace(/\b\w/g,function(c){return c.toUpperCase();});};
  else if(type==='sentence')fn=function(s){return s.replace(/(^\s*\w|[.!?]\s*\w)/g,function(c){return c.toUpperCase();});};
  else if(type==='simplify')fn=function(s){return s2t(s,false);};
  else if(type==='traditional')fn=function(s){return s2t(s,true);};
  else return;
  transformTextNodes(rng,function(target){return fn(target);});
  var el=findEl(_selId);if(el)el.content=t.innerHTML;
}
function transformTextNodes(rng,fn){
  var iter=document.createNodeIterator(rng.commonAncestorContainer,NodeFilter.SHOW_TEXT,{acceptNode:function(n){try{return rng.intersectsNode(n)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;}catch(e){return NodeFilter.FILTER_REJECT;}}},false);
  var nodes=[];var n;while((n=iter.nextNode())){if(n.parentNode&&n.parentNode.nodeName!=='RT'&&n.parentNode.nodeName!=='RUBY')nodes.push(n);}
  nodes.forEach(function(node){
    var text=node.textContent||'';var startOff=(node===rng.startContainer)?rng.startOffset:0;var endOff=(node===rng.endContainer)?rng.endOffset:text.length;
    if(startOff>=endOff)return;
    var before=text.substring(0,startOff);var target=text.substring(startOff,endOff);var after=text.substring(endOff);
    var out=fn(target);if(out===target)return;
    node.textContent=before+out+after;
  });
}
function s2t(txt,toTrad){
  if(typeof window.OpenCC==='undefined'||!window.OpenCC.Converter)return txt;
  try{
    var conv=toTrad?window.OpenCC.Converter({from:'cn',to:'tw'}):window.OpenCC.Converter({from:'tw',to:'cn'});
    return conv(txt);
  }catch(e){return txt;}
}
function addPinyin(){
  var t=getEditTarget();if(!t)return;
  if(!window.pinyinPro||!window.pinyinPro.pinyin){alert('拼音库加载失败，请刷新页面后重试');return;}
  var sel=window.getSelection();if(!sel.rangeCount||sel.isCollapsed){alert('请先选中需要注音的文字');return;}
  var rng=sel.getRangeAt(0);
  var hasRuby=false;
  var iter=document.createNodeIterator(t,NodeFilter.SHOW_ELEMENT,{acceptNode:function(n){try{return n.nodeName==='RUBY'&&rng.intersectsNode(n)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;}catch(e){return NodeFilter.FILTER_REJECT;}}},false);
  var rb;while((rb=iter.nextNode())){hasRuby=true;break;}
  if(hasRuby){
    var rubies=[];var iter2=document.createNodeIterator(t,NodeFilter.SHOW_ELEMENT,{acceptNode:function(n){try{return n.nodeName==='RUBY'&&rng.intersectsNode(n)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;}catch(e){return NodeFilter.FILTER_REJECT;}}},false);
    while((rb=iter2.nextNode()))rubies.push(rb);
    rubies.forEach(function(r){var txt='';for(var c=r.firstChild;c;c=c.nextSibling){if(c.nodeType===3||(c.nodeType===1&&c.nodeName!=='RT'))txt+=c.textContent||'';}var tn=document.createTextNode(txt);r.parentNode.replaceChild(tn,r);});
    var el=findEl(_selId);if(el)el.content=t.innerHTML;return;
  }
  var textNodes=[];var titer=document.createNodeIterator(rng.commonAncestorContainer,NodeFilter.SHOW_TEXT,{acceptNode:function(n){try{return rng.intersectsNode(n)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;}catch(e){return NodeFilter.FILTER_REJECT;}}},false);
  var tn;while((tn=titer.nextNode())){if(tn.parentNode&&tn.parentNode.nodeName!=='RT'&&tn.parentNode.nodeName!=='RUBY')textNodes.push(tn);}
  textNodes.forEach(function(node){
    var text=node.textContent||'';var startOff=(node===rng.startContainer)?rng.startOffset:0;var endOff=(node===rng.endContainer)?rng.endOffset:text.length;
    if(startOff>=endOff)return;
    var before=text.substring(0,startOff);var target=text.substring(startOff,endOff);var after=text.substring(endOff);
    var frag=document.createDocumentFragment();var i=0;
    while(i<target.length){
      if(/[\u4e00-\u9fff]/.test(target[i])){
        var cs=i;while(i<target.length&&/[\u4e00-\u9fff]/.test(target[i]))i++;
        var block=target.substring(cs,i);var pyArr=[];
        try{pyArr=window.pinyinPro.pinyin(block,{toneType:'symbol',type:'array'});}catch(e){}
        for(var j=0;j<block.length;j++){var ruby=document.createElement('ruby');ruby.appendChild(document.createTextNode(block[j]));var rt=document.createElement('rt');rt.setAttribute('contenteditable','false');rt.textContent=pyArr[j]||block[j];ruby.appendChild(rt);frag.appendChild(ruby);}
      }else{var ns=i;while(i<target.length&&!/[\u4e00-\u9fff]/.test(target[i]))i++;frag.appendChild(document.createTextNode(target.substring(ns,i)));}
    }
    if(before)frag.insertBefore(document.createTextNode(before),frag.firstChild);
    if(after)frag.appendChild(document.createTextNode(after));
    node.parentNode.replaceChild(frag,node);
  });
  var el=findEl(_selId);if(el)el.content=t.innerHTML;
}
function wrapSelection(wrapEl){
  var sel=window.getSelection();if(!sel.rangeCount||sel.isCollapsed)return;
  var rng=sel.getRangeAt(0);try{rng.surroundContents(wrapEl);}catch(e){}
}
function showInlineMenu(opts,fn){
  var m=document.createElement('div');m.style.cssText='position:fixed;background:#0a1418;border:1px solid #2c6e7e;border-radius:4px;padding:4px;z-index:99999;box-shadow:0 4px 16px rgba(0,0,0,0.6);min-width:80px;';
  opts.forEach(function(o){var it=document.createElement('div');it.textContent=o.l;it.style.cssText='padding:4px 10px;color:#aef0ff;font-size:11px;cursor:pointer;border-radius:2px;';it.addEventListener('mouseenter',function(){it.style.background='#1c525a';it.style.color='#fff';});it.addEventListener('mouseleave',function(){it.style.background='transparent';it.style.color='#aef0ff';});it.addEventListener('click',function(){fn(o.v);m.remove();});m.appendChild(it);});
  document.body.appendChild(m);
  var r=window.getSelection().getRangeAt(0).getBoundingClientRect();
  m.style.left=(r.left||100)+'px';m.style.top=((r.bottom||100)+4)+'px';
  setTimeout(function(){document.addEventListener('mousedown',function h(){m.remove();document.removeEventListener('mousedown',h);});},10);
}
function showParaSpacingDialog(){
  var el=_selId?findEl(_selId):null;if(!el)return;
  var before=prompt('段前间距 (px):',el.marginTop||0);if(before===null)return;
  var after=prompt('段后间距 (px):',el.marginBottom||0);if(after===null)return;
  el.marginTop=parseFloat(before)||0;el.marginBottom=parseFloat(after)||0;renderCanvas();switchTab(_activeTab);
}
function toggleDropCap(){
  var el=_selId?findEl(_selId):null;if(!el||el.type!=='text')return;
  el.dropCap=!el.dropCap;renderCanvas();switchTab(_activeTab);
}
function clearElProps(el){
  if(!el)return;
  delete el.fontWeight;delete el.fontStyle;delete el.textDecoration;
  delete el.textAlign;delete el.textLastAlign;delete el.lineHeight;
  delete el.marginTop;delete el.marginBottom;delete el.dropCap;
  renderCanvas();switchTab(_activeTab);
}
function showFindReplace(){
  var t=getEditTarget();if(!t){alert('请双击文本元素进入编辑后再使用查找替换');return;}
  var kw=prompt('查找:');if(!kw)return;
  var rp=prompt('替换为:');if(rp===null)return;
  var html=t.innerHTML;var re=new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g');
  t.innerHTML=html.replace(re,rp);
  var el=findEl(_selId);if(el)el.content=t.innerHTML;
}

function ribbonInsert(){
  var wrap=document.createElement('div');wrap.style.cssText='display:flex;align-items:flex-start;gap:0 16px;width:100%;padding:18px 6px 4px;position:relative;flex-wrap:nowrap;overflow-x:auto;';
  // 左列标题
  var tL=document.createElement('div');tL.style.cssText='position:absolute;top:0;left:6px;font-size:11px;color:#406070;letter-spacing:0.5px;white-space:nowrap;';tL.textContent='文字层插入';wrap.appendChild(tL);
  // 右列标题
  var tR=document.createElement('div');tR.style.cssText='position:absolute;top:0;left:50%;font-size:11px;color:#406070;letter-spacing:0.5px;white-space:nowrap;';tR.textContent='幻灯片元素插入';wrap.appendChild(tR);

  // ════ 左列：文字层插入 ════
  var colL=document.createElement('div');colL.style.cssText='display:flex;flex-wrap:wrap;align-content:flex-start;align-items:flex-start;gap:2px;max-width:calc(50% - 8px);padding-right:10px;border-right:1px solid #2c6e7e40;flex-shrink:0;';
  colL.appendChild(mkRBtnV('▦','表格',function(){addTableToSlide();}));
  colL.appendChild(mkRBtnV('🖼','图片',function(){addImgToSlide();}));
  colL.appendChild(mkRBtnV('ƒx','公式',function(){addFormulaToSlide();}));
  colL.appendChild(mkRBtnV('🔗','链接',function(){addLinkToSlide();}));
  colL.appendChild(mkRBtnV('</>','代码',function(){addCodeToSlide();}));
  colL.appendChild(mkRBtnV('Ω','符号',function(){addSymbolToSlide();}));
  colL.appendChild(mkRBtnV('☺','表情',function(){addEmojiToSlide();}));
  colL.appendChild(mkRBtnV('🕐','日期',function(){addDatetimeToSlide();}));
  wrap.appendChild(colL);

  // ════ 右列：幻灯片元素插入 ════
  var colR=document.createElement('div');colR.style.cssText='display:flex;flex-wrap:wrap;align-content:flex-start;align-items:flex-start;gap:2px;max-width:calc(50% - 8px);padding-left:10px;flex-shrink:0;';
  colR.appendChild(mkRBtnV('T','文本框',function(){addElToSlide('text');}));
  colR.appendChild(mkRBtnV('🖼','浮动图片',function(){addImgToSlide();}));
  colR.appendChild(mkRBtnV('▱','形状',function(){showShapeMenu();}));
  colR.appendChild(mkRBtnV('📊','图表',function(){addChartToSlide();}));
  colR.appendChild(mkRBtnV('🎬','视频',function(){addVideoToSlide();}));
  colR.appendChild(mkRBtnV('🎵','音频',function(){addAudioToSlide();}));
  colR.appendChild(mkRBtnV('📄','文档',function(){addDocumentToSlide();}));
  wrap.appendChild(colR);

  return wrap;
}

function ribbonDesign(){
  var wrap=mkRRow();wrap.style.alignSelf='center';
  if(!_data){var hint=document.createElement('span');hint.style.cssText='color:#556;font-size:11px;';hint.textContent='请先打开幻灯片';wrap.appendChild(hint);return wrap;}
  var sl=_data.slides[curIdx()];if(!sl){var h2=document.createElement('span');h2.style.cssText='color:#556;font-size:11px;';h2.textContent='无幻灯片';wrap.appendChild(h2);return wrap;}

  var gBg=mkRGroup('背景');
  gBg.appendChild(mkRBtn('纯色','▦',function(){
    var c=prompt('背景颜色（如 #1a2a3a 或 rgb(...)）:',sl.bgColor||'#0f1729');if(!c)return;
    pushUndo();sl.bgColor=c;sl.bgImage='';sl.bgGradient='';renderCanvas();refreshThumbs();
  }));
  gBg.appendChild(mkRBtn('图片','🖼',function(){
    var input=document.createElement('input');input.type='file';input.accept='image/*';
    input.addEventListener('change',function(){
      if(input.files&&input.files[0]){var r=new FileReader();r.onload=function(e){pushUndo();sl.bgImage=e.target.result;sl.bgGradient='';renderCanvas();refreshThumbs();};r.readAsDataURL(input.files[0]);}
    });input.click();
  }));
  var gradOpts=[
    {v:'linear-gradient(135deg,#0f1729,#2c6e7e)',l:'青蓝'},{v:'linear-gradient(135deg,#1a1025,#9b59b6)',l:'紫罗兰'},
    {v:'linear-gradient(135deg,#0a1a0a,#2ecc71)',l:'翠绿'},{v:'linear-gradient(135deg,#2c1010,#c0392b)',l:'赤红'},
    {v:'linear-gradient(135deg,#1a1a2e,#16213e)',l:'深蓝'},{v:'radial-gradient(circle,#2c6e7e,#0f1729)',l:'径向青'}
  ];
  gBg.appendChild(mkRSelect(gradOpts,sl.bgGradient||'',function(v){pushUndo();sl.bgGradient=v;sl.bgImage='';renderCanvas();refreshThumbs();}));
  gBg.appendChild(mkRBtn('清除','✕',function(){pushUndo();sl.bgColor=getTheme().bg;sl.bgImage='';sl.bgGradient='';renderCanvas();refreshThumbs();}));
  wrap.appendChild(gBg);wrap.appendChild(mkRSep());

  var gTheme=mkRGroup('主题');
  TH.forEach(function(t,i){
    gTheme.appendChild(mkRBtn(t.n,'',function(){
      pushUndo();
      _data.themeIdx=i;
      _data.slides.forEach(function(s){if(!s.bgImage&&!s.bgGradient)s.bgColor=t.bg;});
      renderCanvas();refreshThumbs();switchTab('design');
    },_data.themeIdx===i));
  });
  wrap.appendChild(gTheme);wrap.appendChild(mkRSep());

  var gSize=mkRGroup('幻灯片大小');
  gSize.appendChild(mkRSelect([{v:'960x540',l:'16:9 标准'},{v:'1024x768',l:'4:3 标准'},{v:'1280x720',l:'16:9 宽屏'}],SW+'x'+SH,function(v){
    var parts=v.split('x');SW=parseInt(parts[0]);SH=parseInt(parts[1]);_data.slideWidth=SW;_data.slideHeight=SH;
    var ci=document.getElementById('ssCI');if(ci){ci.style.width=SW+'px';ci.style.height=SH+'px';}
    renderCanvas();refreshThumbs();
  }));
  wrap.appendChild(gSize);

  return wrap;
}

function ribbonDraw(){
  var wrap=mkRRow();wrap.style.alignSelf='center';
  var gTool=mkRGroup('画笔');
  gTool.appendChild(mkRBtn('画笔','✏',function(){_drawTool='pen';startSlideDraw();updateStatusBar();},_drawTool==='pen'));
  gTool.appendChild(mkRBtn('铅笔','✍',function(){_drawTool='pencil';startSlideDraw();updateStatusBar();},_drawTool==='pencil'));
  gTool.appendChild(mkRBtn('荧光笔','🖍',function(){_drawTool='highlighter';startSlideDraw();updateStatusBar();},_drawTool==='highlighter'));
  gTool.appendChild(mkRBtn('橡皮擦','🧹',function(){_drawTool='eraser';startSlideDraw();updateStatusBar();},_drawTool==='eraser'));
  gTool.appendChild(mkRBtn('彩虹','🌈',function(){_drawTool='rainbow';startSlideDraw();updateStatusBar();},_drawTool==='rainbow'));
  wrap.appendChild(gTool);wrap.appendChild(mkRSep());
  var gStyle=mkRGroup('样式');
  var cBtn=document.createElement('button');cBtn.textContent='🎨';cBtn.title='画笔颜色';
  cBtn.style.cssText='padding:4px 8px;border:none;border-radius:3px;background:transparent;cursor:pointer;font-size:13px;color:#aef0ff;flex-shrink:0;';
  cBtn.addEventListener('mouseenter',function(){cBtn.style.background='#1c525a';});
  cBtn.addEventListener('mouseleave',function(){cBtn.style.background='transparent';});
  cBtn.addEventListener('click',function(e){e.stopPropagation();var inp=document.createElement('input');inp.type='color';inp.value=_drawColor;inp.style.cssText='position:absolute;opacity:0;pointer-events:none;';document.body.appendChild(inp);inp.addEventListener('input',function(){_drawColor=inp.value;});inp.click();setTimeout(function(){if(inp.parentNode)document.body.removeChild(inp);},30000);});
  cBtn.addEventListener('mousedown',function(e){e.stopPropagation();});
  gStyle.appendChild(cBtn);
  gStyle.appendChild(mkRSelect([{v:'1',l:'极细'},{v:'2',l:'细'},{v:'3',l:'中'},{v:'5',l:'粗'},{v:'8',l:'特粗'},{v:'12',l:'超粗'}],String(_drawSize),function(v){_drawSize=parseInt(v);}));
  gStyle.appendChild(mkRSelect([{v:'solid',l:'实线'},{v:'dashed',l:'虚线'},{v:'dotted',l:'点线'}],_drawLineStyle,function(v){_drawLineStyle=v;}));
  wrap.appendChild(gStyle);wrap.appendChild(mkRSep());
  var gAct=mkRGroup('操作');
  gAct.appendChild(mkRBtn('撤销','↩',function(){slideDrawUndo();}));
  gAct.appendChild(mkRBtn('重做','↪',function(){slideDrawRedo();}));
  gAct.appendChild(mkRBtn('清除','🗑',function(){slideDrawClear();}));
  gAct.appendChild(mkRBtn('保存为图','💾',function(){saveSlideDrawAsElement();}));
  wrap.appendChild(gAct);
  return wrap;
}

function ribbonTransition(){
  var wrap=mkRRow();wrap.style.alignSelf='center';
  if(!_data){var hint=document.createElement('span');hint.style.cssText='color:#556;font-size:11px;';hint.textContent='请先选择幻灯片';wrap.appendChild(hint);return wrap;}
  var gEff=mkRGroup('切换效果');
  var effOpts=Object.keys(SLIDE_EFFECTS).map(function(k){return{v:k,l:SLIDE_EFFECTS[k]};});
  gEff.appendChild(mkRSelect(effOpts,_data.effect||'slide',function(v){_data.effect=v;}));
  wrap.appendChild(gEff);wrap.appendChild(mkRSep());
  var gSpeed=mkRGroup('速度');
  gSpeed.appendChild(mkRSelect([{v:'200',l:'快'},{v:'500',l:'中'},{v:'800',l:'慢'},{v:'1200',l:'很慢'}],String(_data.speed||500),function(v){_data.speed=parseInt(v);}));
  wrap.appendChild(gSpeed);wrap.appendChild(mkRSep());
  var gAuto=mkRGroup('自动播放');
  gAuto.appendChild(mkRBtn('自动播放','▶',function(){_data.autoplay=!_data.autoplay;switchTab('transition');},_data.autoplay));
  var delayOpts=[{v:'1000',l:'1秒'},{v:'2000',l:'2秒'},{v:'3000',l:'3秒'},{v:'5000',l:'5秒'},{v:'8000',l:'8秒'}];
  gAuto.appendChild(mkRSelect(delayOpts,String(_data.autoplayDelay||3000),function(v){_data.autoplayDelay=parseInt(v);}));
  gAuto.appendChild(mkRBtn('循环','🔁',function(){_data.loop=!_data.loop;switchTab('transition');},_data.loop!==false));
  wrap.appendChild(gAuto);wrap.appendChild(mkRSep());
  var gNav=mkRGroup('导航');
  gNav.appendChild(mkRBtn('分页点','⊙',function(){_data.showPagination=!_data.showPagination;switchTab('transition');},_data.showPagination!==false));
  gNav.appendChild(mkRBtn('箭头','◄►',function(){_data.showNavigation=!_data.showNavigation;switchTab('transition');},_data.showNavigation!==false));
  wrap.appendChild(gNav);
  return wrap;
}

function ribbonAnimation(){
  var wrap=mkRRow();wrap.style.alignSelf='center';
  var el=_selId?findEl(_selId):null;
  if(!el){var hint=document.createElement('span');hint.style.cssText='color:#556;font-size:11px;';hint.textContent='请先选中一个元素来设置动画';wrap.appendChild(hint);return wrap;}
  var anim=el.anim||{enter:'fadeIn',exit:'none',em:'none',delay:0,dur:500};
  var gEnter=mkRGroup('进入');
  gEnter.appendChild(mkRSelect(EA,anim.enter||'none',function(v){applyAnimProp('enter',v);}));
  wrap.appendChild(gEnter);wrap.appendChild(mkRSep());
  var gExit=mkRGroup('退出');
  gExit.appendChild(mkRSelect(XA,anim.exit||'none',function(v){applyAnimProp('exit',v);}));
  wrap.appendChild(gExit);wrap.appendChild(mkRSep());
  var gEmph=mkRGroup('强调');
  gEmph.appendChild(mkRSelect(MA,anim.em||'none',function(v){applyAnimProp('em',v);}));
  wrap.appendChild(gEmph);wrap.appendChild(mkRSep());
  var gTiming=mkRGroup('计时');
  gTiming.appendChild(mkRBtn('延迟',null,function(){var v=prompt('延迟 (ms):',anim.delay||0);if(v!==null)applyAnimProp('delay',parseInt(v));}));
  gTiming.appendChild(mkRBtn('持续',null,function(){var v=prompt('持续 (ms):',anim.dur||500);if(v!==null)applyAnimProp('dur',parseInt(v));}));
  wrap.appendChild(gTiming);
  return wrap;
}

function applyProp(key,val){var el=_selId?findEl(_selId):null;if(!el)return;pushUndo();el[key]=val;renderCanvas();switchTab(_activeTab);}
function toggleProp(key,valA,valB){var el=_selId?findEl(_selId):null;if(!el)return;pushUndo();el[key]=el[key]===valA?valB:valA;renderCanvas();switchTab(_activeTab);}
function applyAnimProp(key,val){var el=_selId?findEl(_selId):null;if(!el)return;pushUndo();if(!el.anim)el.anim={enter:'fadeIn',exit:'none',em:'none',delay:0,dur:500};el.anim[key]=val;renderCanvas();}
function moveLayer(dir){if(!_selId||!_data)return;var sl=_data.slides[curIdx()];if(!sl)return;var idx=(sl.elements||[]).findIndex(function(e){return e.id===_selId;});if(idx<0)return;var ni=idx+dir;if(ni<0||ni>=sl.elements.length)return;pushUndo();var tmp=sl.elements[idx];sl.elements[idx]=sl.elements[ni];sl.elements[ni]=tmp;renderCanvas();}
function addVideoToSlide(){
  if(!_data)return;
  var input=document.createElement('input');input.type='file';input.accept='video/*';
  input.addEventListener('change',function(){
    if(input.files&&input.files[0]){
      var reader=new FileReader();reader.onload=function(e){
        var sl=_data.slides[curIdx()];if(sl){pushUndo();sl.elements.push(mkVideo(e.target.result,SW*0.2,SH*0.2,320,180));renderCanvas();refreshThumbs();}
      };reader.readAsDataURL(input.files[0]);
    }
  });input.click();
}
function addAudioToSlide(){
  if(!_data)return;
  var input=document.createElement('input');input.type='file';input.accept='audio/*';
  input.addEventListener('change',function(){
    if(input.files&&input.files[0]){
      var reader=new FileReader();reader.onload=function(e){
        var sl=_data.slides[curIdx()];if(sl){pushUndo();sl.elements.push(mkAudio(e.target.result,SW*0.35,SH*0.45,220,60));renderCanvas();refreshThumbs();}
      };reader.readAsDataURL(input.files[0]);
    }
  });input.click();
}
function addTableToSlide(){
  var rows=parseInt(prompt('行数:','3'));var cols=parseInt(prompt('列数:','4'));
  if(!rows||!cols||rows<1||cols<1)return;
  if(!_data)return;var sl=_data.slides[curIdx()];if(!sl)return;var t=getTheme();
  pushUndo();
  sl.elements.push(mkTable(rows,cols,SW*0.15,SH*0.2,Math.min(SW*0.6,cols*100),Math.min(SH*0.5,rows*32),t));
  renderCanvas();refreshThumbs();
}
function addFormulaToSlide(){
  var formula=prompt('输入公式（LaTeX，如 \\frac{a}{b}）:');if(!formula)return;
  if(!_data)return;var sl=_data.slides[curIdx()];if(!sl)return;
  pushUndo();
  var html='<span class="formula" data-latex="'+encodeURIComponent(formula)+'" style="font-size:20px;">'+formula+'</span>';
  sl.elements.push({id:'el'+Date.now(),type:'text',x:SW*0.3,y:SH*0.4,w:200,h:40,content:html,fontSize:20,color:getTheme().tx});
  renderCanvas();refreshThumbs();
}
function addLinkToSlide(){
  var url=prompt('链接地址:');if(!url)return;var txt=prompt('链接文字:',url);if(!txt)return;
  var t=getEditTarget();
  if(t){execTextCmd('createLink',url);}
  else{if(!_data)return;var sl=_data.slides[curIdx()];if(!sl)return;pushUndo();sl.elements.push({id:'el'+Date.now(),type:'text',x:SW*0.3,y:SH*0.4,w:200,h:40,content:'<a href="'+url+'">'+txt+'</a>',fontSize:16,color:'#4aa'});renderCanvas();refreshThumbs();}
}
function addCodeToSlide(){
  var code=prompt('输入代码:');if(!code)return;
  if(!_data)return;var sl=_data.slides[curIdx()];if(!sl)return;
  pushUndo();
  var html='<pre style="background:#1e1e2e;color:#aef0ff;padding:8px;border-radius:4px;font-family:Consolas,monospace;font-size:12px;white-space:pre-wrap;">'+code.replace(/</g,'&lt;')+'</pre>';
  sl.elements.push({id:'el'+Date.now(),type:'text',x:SW*0.15,y:SH*0.2,w:SW*0.5,h:80,content:html,fontSize:12,color:'#aef0ff'});
  renderCanvas();refreshThumbs();
}
function addSymbolToSlide(){
  var syms='© ® ™ § ¶ ° ± × ÷ √ ∞ ∑ ∏ ∫ ≠ ≤ ≥ ≈ ← → ↑ ↓ ↔ ★ ☆ ♠ ♥ ♦ ♣';
  var sy=prompt('选择符号（复制需要的）:\n'+syms);if(!sy)return;
  var t=getEditTarget();
  if(t){execTextCmd('insertText',sy);}
}
function addEmojiToSlide(){
  var emojis='😀 😃 😄 😁 😆 😅 😂 😊 😍 😘 😎 🤔 👍 👎 👏 🙏 💪 ❤️ 🔥 ⭐';
  var em=prompt('选择表情（复制需要的）:\n'+emojis);if(!em)return;
  var t=getEditTarget();
  if(t){execTextCmd('insertText',em);}
  else{if(!_data)return;var sl=_data.slides[curIdx()];if(!sl)return;sl.elements.push({id:'el'+Date.now(),type:'text',x:SW*0.4,y:SH*0.4,w:80,h:40,content:em,fontSize:24,color:getTheme().tx});renderCanvas();refreshThumbs();}
}
function addDatetimeToSlide(){
  var now=new Date();
  var y=now.getFullYear(),m=String(now.getMonth()+1).padStart(2,'0'),d=String(now.getDate()).padStart(2,'0');
  var h=String(now.getHours()).padStart(2,'0'),min=String(now.getMinutes()).padStart(2,'0');
  var opts=[y+'-'+m+'-'+d,y+'/'+m+'/'+d,y+'年'+m+'月'+d+'日',h+':'+min,y+'-'+m+'-'+d+' '+h+':'+min];
  var txt=prompt('选择日期时间格式:\n'+opts.map(function(o,i){return (i+1)+'. '+o;}).join('\n'));if(!txt)return;
  var idx=parseInt(txt)-1;if(idx<0||idx>=opts.length)return;var val=opts[idx];
  var t=getEditTarget();
  if(t){execTextCmd('insertText',val);}
  else{if(!_data)return;var sl=_data.slides[curIdx()];if(!sl)return;sl.elements.push({id:'el'+Date.now(),type:'text',x:SW*0.3,y:SH*0.4,w:160,h:30,content:val,fontSize:16,color:getTheme().tx});renderCanvas();refreshThumbs();}
}
function addChartToSlide(){
  if(!_data)return;var sl=_data.slides[curIdx()];if(!sl)return;
  var types=[
    {v:'bar',l:'柱状图'},{v:'line',l:'折线图'},{v:'pie',l:'饼图'},
    {v:'scatter',l:'散点图'},{v:'area',l:'面积图'},{v:'radar',l:'雷达图'}
  ];
  showInlineMenu(types,function(v){
    var opt=defChartOption(v);
    pushUndo();sl.elements.push(mkChart(opt,SW*0.15,SH*0.15,360,260));
    renderCanvas();refreshThumbs();
  });
}
function defChartOption(t){
  var cats=['一月','二月','三月','四月','五月','六月'];
  var s1=[120,200,150,80,70,110],s2=[60,95,130,145,160,100];
  var base={title:{text:'示例图表',textStyle:{color:'#aef0ff',fontSize:14}},tooltip:{trigger:'axis'},legend:{data:['系列A','系列B'],textStyle:{color:'#aef0ff'}},textStyle:{color:'#aef0ff'}};
  if(t==='bar'||t==='line'||t==='area'){
    var series=[{name:'系列A',type:t==='area'?'line':t,data:s1,smooth:true,itemStyle:{color:'#2c7a6e'}},{name:'系列B',type:t==='area'?'line':t,data:s2,smooth:true,itemStyle:{color:'#c5a05a'}}];
    if(t==='area'){series[0].areaStyle={opacity:0.3};series[1].areaStyle={opacity:0.3};}
    return Object.assign(base,{xAxis:{type:'category',data:cats,axisLine:{lineStyle:{color:'#5a7a82'}}},yAxis:{type:'value',axisLine:{lineStyle:{color:'#5a7a82'}},splitLine:{lineStyle:{color:'#1c3a42'}}},series:series});
  }
  if(t==='pie'){return{title:{text:'示例饼图',textStyle:{color:'#aef0ff',fontSize:14}},tooltip:{trigger:'item'},legend:{bottom:0,textStyle:{color:'#aef0ff'}},textStyle:{color:'#aef0ff'},series:[{type:'pie',radius:'60%',data:[{value:335,name:'A'},{value:310,name:'B'},{value:234,name:'C'},{value:135,name:'D'}],itemStyle:{borderColor:'#1e2a36',borderWidth:2},label:{color:'#aef0ff'}}]};}
  if(t==='scatter'){return Object.assign(base,{xAxis:{type:'value',axisLine:{lineStyle:{color:'#5a7a82'}}},yAxis:{type:'value',axisLine:{lineStyle:{color:'#5a7a82'}},splitLine:{lineStyle:{color:'#1c3a42'}}},series:[{type:'scatter',data:[[10,8],[20,15],[30,22],[40,35],[50,28],[60,40]],itemStyle:{color:'#2c7a6e'}}]});}
  if(t==='radar'){return{title:{text:'示例雷达图',textStyle:{color:'#aef0ff',fontSize:14}},tooltip:{},legend:{data:['预算','实际'],textStyle:{color:'#aef0ff'}},textStyle:{color:'#aef0ff'},radar:{indicator:[{name:'销售',max:100},{name:'管理',max:100},{name:'技术',max:100},{name:'客服',max:100},{name:'研发',max:100}],axisName:{color:'#aef0ff'},splitLine:{lineStyle:{color:'#1c3a42'}},splitArea:{areaStyle:{color:['#1e2a36','#162028']}}},series:[{type:'radar',data:[{value:[80,70,60,50,90],name:'预算'},{value:[60,80,70,90,70],name:'实际'}]}]};}
  return base;
}
function addDocumentToSlide(){
  var url=prompt('文档地址（PDF/Word/PPT URL）:');if(!url)return;
  if(!_data)return;var sl=_data.slides[curIdx()];if(!sl)return;
  pushUndo();
  var html='<iframe src="'+url+'" style="width:100%;height:100%;border:1px solid #888;" frameborder="0"></iframe>';
  sl.elements.push({id:'el'+Date.now(),type:'text',x:SW*0.15,y:SH*0.15,w:400,h:300,content:html,fontSize:12,color:'#aef0ff'});
  renderCanvas();refreshThumbs();
}
function showShapeMenu(){
  var opts=ST.map(function(s){return{v:s.v,l:s.l};});
  showInlineMenu(opts,function(v){addElToSlide('shape',v);});
}

function enterTextEdit(dom,el){
  if(!dom||!el||(el.type!=='text'&&el.type!=='table'))return;
  pushUndo();
  var sb=document.getElementById('ssSB');if(sb)sb.style.display='none';
  dom._editing=true;dom.focus();
  dom.style.cursor='text';dom.style.userSelect='text';
  var range=document.createRange();range.selectNodeContents(dom);
  var sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);
}
function getEditTarget(){var el=_selId?findEl(_selId):null;if(!el||(el.type!=='text'&&el.type!=='table'))return null;var dom=document.getElementById(el.id);if(!dom||!dom._editing)return null;return dom;}
function execTextCmd(cmd,val){var t=getEditTarget();if(!t)return;document.execCommand(cmd,false,val||null);var el=findEl(_selId);if(el)el.content=t.innerHTML;}
function execTextFontSize(px){
  var t=getEditTarget();if(!t)return;
  var sel=window.getSelection();if(!sel.rangeCount||sel.isCollapsed)return;
  var rng=sel.getRangeAt(0);
  document.execCommand('fontSize',false,'7');
  var fonts=t.querySelectorAll('font[size="7"]');
  fonts.forEach(function(f){f.removeAttribute('size');f.style.fontSize=px+'px';});
  var el=findEl(_selId);if(el)el.content=t.innerHTML;
}
function isTextEditing(){var t=getEditTarget();return !!t;}
function escapeTextEdit(){var t=getEditTarget();if(t)t.blur();}

var CN_FONTS=[
  {label:'宋体',family:'"宋体", SimSun, serif'},
  {label:'黑体',family:'"黑体", SimHei, "Microsoft YaHei", sans-serif'},
  {label:'楷体',family:'"楷体", KaiTi, serif'},
  {label:'仿宋',family:'"仿宋", FangSong, serif'},
  {label:'微软雅黑',family:'"微软雅黑", "Microsoft YaHei", sans-serif'},
  {label:'思源黑体',family:'"Source Han Sans", "Noto Sans CJK SC", sans-serif'},
  {label:'思源宋体',family:'"Source Han Serif", "Noto Serif CJK SC", serif'},
  {label:'苹方',family:'"PingFang SC", "Helvetica Neue", sans-serif'}
];
var EN_FONTS=[
  {label:'Arial',family:'Arial, sans-serif'},
  {label:'Times New Roman',family:'"Times New Roman", serif'},
  {label:'Georgia',family:'Georgia, serif'},
  {label:'Courier New',family:'"Courier New", monospace'},
  {label:'Verdana',family:'Verdana, sans-serif'},
  {label:'Calibri',family:'Calibri, sans-serif'},
  {label:'Impact',family:'Impact, sans-serif'}
];



/* ── 左侧缩略图面板 ── */
function thumbPanel(d){
  var p=document.createElement('div');p.id='ssTP';
  p.style.cssText='width:170px;min-width:150px;background:#0a1418;border-right:1px solid #1c3a42;display:flex;flex-direction:column;flex-shrink:0;';
  var hd=document.createElement('div');hd.style.cssText='color:#aef0ff;font-size:11px;font-weight:bold;padding:10px 10px 6px;border-bottom:1px solid #1c3a42;';hd.textContent='幻灯片';p.appendChild(hd);
  var lw=document.createElement('div');lw.id='ssTL';lw.style.cssText='flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px;';p.appendChild(lw);
  var ab=document.createElement('button');ab.textContent='+ 新建页面';
  ab.style.cssText='margin:6px 8px 10px;padding:7px 0;border:1px dashed #2c6e7e;border-radius:4px;background:transparent;color:#2c7a6e;cursor:pointer;font-size:11px;width:calc(100% - 16px);';
  ab.addEventListener('click',function(){var ns=defSlide((d.slides||[]).length,d.themeIdx);ns.elements.push(mkText(SW*0.1,SH*0.4,SW*0.8,60,getTheme()));d.slides.push(ns);refreshThumbs();selectSlide(d.slides.length-1);});
  p.appendChild(ab);return p;
}

function refreshThumbs(){
  var lw=document.getElementById('ssTL');if(!lw||!_data)return;lw.innerHTML='';
  (_data.slides||[]).forEach(function(s,i){
    var it=document.createElement('div');it.style.cssText='border:2px solid #1c3a42;border-radius:4px;overflow:hidden;cursor:pointer;background:#0a0e1a;transition:border-color 0.15s;position:relative;';
    var tw=document.createElement('div');tw.style.cssText='position:relative;width:100%;overflow:hidden;height:70px;';
    var th=buildHTML(s,true);th.style.width='100%';th.style.height='0';th.style.paddingBottom='56.25%';th.style.position='relative';th.style.transformOrigin='top left';th.style.transform='scale(0.18)';th.style.pointerEvents='none';tw.appendChild(th);
    var bd=document.createElement('span');bd.style.cssText='position:absolute;bottom:2px;left:2px;background:rgba(0,0,0,0.7);color:#aaa;font-size:9px;padding:1px 5px;border-radius:2px;';bd.textContent=i+1;
    // 删除按钮（右上角 ×）
    var db=document.createElement('span');db.textContent='×';db.title='删除此页';
    db.style.cssText='position:absolute;top:2px;right:3px;background:rgba(255,60,60,0.7);color:#fff;font-size:11px;width:16px;height:16px;line-height:14px;text-align:center;border-radius:50%;cursor:pointer;display:none;z-index:2;font-weight:bold;';
    db.addEventListener('click',function(e){e.stopPropagation();deleteSlide(i);});
    db.addEventListener('mousedown',function(e){e.stopPropagation();});
    it.appendChild(tw);it.appendChild(bd);it.appendChild(db);
    it.setAttribute('data-si',i);
    it.addEventListener('click',function(){selectSlide(i);});
    // 悬浮时显示删除按钮
    it.addEventListener('mouseenter',function(){db.style.display='block';});
    it.addEventListener('mouseleave',function(){db.style.display='none';});
    // 右键菜单
    it.addEventListener('contextmenu',function(e){
      e.preventDefault();e.stopPropagation();showSlideContextMenu(e.clientX,e.clientY,i);
    });
    lw.appendChild(it);
  });highlightThumb();
}

/* ── 幻灯片页面管理 ── */
function deleteSlide(idx){
  if(!_data||!_data.slides)return;
  if(_data.slides.length<=1){return;} // 至少保留 1 页
  pushUndo();
  _data.slides.splice(idx,1);
  var ci=curIdx();
  if(ci>=_data.slides.length)ci=_data.slides.length-1;
  if(ci<0)ci=0;
  refreshThumbs();selectSlide(ci);
}

function moveSlideUp(idx){
  if(!_data||!_data.slides||idx<=0)return;
  pushUndo();
  var arr=_data.slides;var tmp=arr[idx];arr[idx]=arr[idx-1];arr[idx-1]=tmp;
  refreshThumbs();selectSlide(idx-1);
}

function moveSlideDown(idx){
  if(!_data||!_data.slides||idx>=_data.slides.length-1)return;
  pushUndo();
  var arr=_data.slides;var tmp=arr[idx];arr[idx]=arr[idx+1];arr[idx+1]=tmp;
  refreshThumbs();selectSlide(idx+1);
}

function duplicateSlide(idx){
  if(!_data||!_data.slides)return;
  pushUndo();
  var copy=JSON.parse(JSON.stringify(_data.slides[idx]));
  copy.id='s'+Date.now()+'-dup';
  copy.title=(copy.title||'')+' (副本)';
  _data.slides.splice(idx+1,0,copy);
  refreshThumbs();selectSlide(idx+1);
}

function showSlideContextMenu(x,y,idx){
  // 移除旧菜单
  var old=document.getElementById('ssSlideCtxMenu');if(old)old.remove();
  var menu=document.createElement('div');menu.id='ssSlideCtxMenu';
  menu.style.cssText='position:fixed;left:'+x+'px;top:'+y+'px;z-index:100000;background:#0f1e26;border:1px solid #2c6e7e;border-radius:6px;padding:4px 0;min-width:140px;box-shadow:0 4px 16px rgba(0,0,0,0.5);';
  var items=[
    {label:'🗑️ 删除页面',action:function(){deleteSlide(idx);menu.remove();},disabled:_data.slides.length<=1},
    {label:'📋 复制页面',action:function(){duplicateSlide(idx);menu.remove();}},
    {label:'⬆️ 上移',action:function(){moveSlideUp(idx);menu.remove();},disabled:idx===0},
    {label:'⬇️ 下移',action:function(){moveSlideDown(idx);menu.remove();},disabled:idx>=_data.slides.length-1}
  ];
  items.forEach(function(it){
    var row=document.createElement('div');
    row.textContent=it.label;
    row.style.cssText='padding:6px 14px;cursor:'+(it.disabled?'not-allowed':'pointer')+';font-size:12px;color:'+(it.disabled?'#3a5a6a':'#aef0ff')+';white-space:nowrap;';
    if(!it.disabled){
      row.addEventListener('mouseenter',function(){row.style.background='#1a3a4a';});
      row.addEventListener('mouseleave',function(){row.style.background='transparent';});
      row.addEventListener('click',it.action);
    }
    menu.appendChild(row);
  });
  document.body.appendChild(menu);
  // 点击其他地方关闭
  setTimeout(function(){document.addEventListener('mousedown',function cl(e){if(!menu.contains(e.target)){menu.remove();document.removeEventListener('mousedown',cl);}});},0);
}

function highlightThumb(){
  var its=document.querySelectorAll('#ssTL>div');its.forEach(function(it){it.style.borderColor='#1c3a42';});
  var ci=curIdx();if(ci>=0&&its[ci])its[ci].style.borderColor='#2c7a6e';
}

/* ── 中间画布面板 ── */
function canvasPanel(d){
  var p=document.createElement('div');p.id='ssCP';p.style.cssText='flex:1;display:flex;flex-direction:column;overflow:hidden;background:#080c18;position:relative;';
  var cw=document.createElement('div');cw.id='ssCW';cw.style.cssText='flex:1;display:flex;align-items:center;justify-content:center;overflow:auto;padding:20px;position:relative;';
  var co=document.createElement('div');co.id='ssCO';co.style.cssText='position:relative;box-shadow:0 4px 24px rgba(0,0,0,0.5);border:1px solid #2c6e7e;border-radius:4px;overflow:hidden;';
  var ci=document.createElement('div');ci.id='ssCI';ci.style.cssText='position:relative;width:'+SW+'px;height:'+SH+'px;transform-origin:top left;';
  co.appendChild(ci);cw.appendChild(co);p.appendChild(cw);
  bindCanvas(ci);return p;
}

function updateCS(){
  var cw=document.getElementById('ssCW'),co=document.getElementById('ssCO'),ci=document.getElementById('ssCI');
  if(!cw||!co||!ci)return;
  var aw=cw.clientWidth-40,ah=cw.clientHeight-40;_cscale=Math.min(aw/SW,ah/SH,1);
  co.style.width=(SW*_cscale)+'px';co.style.height=(SH*_cscale)+'px';
  ci.style.transform='scale('+_cscale+')';ci.style.width=SW+'px';ci.style.height=SH+'px';
  renderCanvas();
}

function renderCanvas(){
  var ci=document.getElementById('ssCI');if(!ci||!_data)return;
  var idx=curIdx(),sl=_data.slides[idx];if(!sl)return;
  (sl.elements||[]).forEach(function(el){if(el._chart){try{el._chart.dispose();}catch(e){}el._chart=null;}});
  ci.innerHTML='';ci.style.background=sl.bgColor||'#0f1729';
  if(sl.bgImage){ci.style.backgroundImage="url('"+sl.bgImage+"')";ci.style.backgroundSize='cover';ci.style.backgroundPosition='center';}
  if(sl.bgGradient) ci.style.background=sl.bgGradient;

  (sl.elements||[]).forEach(function(el){
    var dom=makeDOM(el,false);if(!dom)return;
    dom.addEventListener('mousedown',function(e){
      e.stopPropagation();
      if(el.type==='text'&&dom.isContentEditable&&document.activeElement===dom)return;
      selEl(el.id);startDrag(e,dom,el);
    });
    if(el.type==='text'){
      dom.addEventListener('dblclick',function(e){
        e.stopPropagation();
        enterTextEdit(dom,el);
      });
      dom.addEventListener('blur',function(){
        if(dom._editing){el.content=dom.innerHTML;dom._editing=false;dom.style.cursor='move';dom.style.userSelect='none';}
      });
    }
    ci.appendChild(dom);
  });
  if(_selId)showSelBox(_selId);
}

function bindCanvas(ci){
  ci.addEventListener('mousedown',function(e){if(e.target===ci)selEl(null);});
  // 移除旧的 keydown 监听器（如有）
  if(_khHandler){document.removeEventListener('keydown',_khHandler);}
  _khHandler=function(e){
    if(!_data||!_modal||_modal.style.display==='none')return;
    if(isTextEditing()){
      if(e.key==='Escape'){e.preventDefault();escapeTextEdit();}
      return;
    }
    if(_selId&&(e.key==='Delete'||e.key==='Backspace')){e.preventDefault();delSel();}
    if(_selId&&e.ctrlKey&&e.key==='d'){e.preventDefault();dupSel();}
    if(e.ctrlKey&&(e.key==='z'||e.key==='Z')){e.preventDefault();undo();}
    if(e.ctrlKey&&(e.key==='y'||e.key==='Y')){e.preventDefault();redo();}
  };
  document.addEventListener('keydown',_khHandler);
  document.addEventListener('mousemove',onMM);document.addEventListener('mouseup',onMU);
}

function startDrag(e,dom,el){pushUndo();_dragging=true;_ds={el:el,dom:dom,sx:e.clientX,sy:e.clientY,ox:el.x,oy:el.y,ow:el.w,oh:el.h};}
function startResize(e,h,dom,el){pushUndo();_resizing=true;_rh=h;_ds={el:el,dom:dom,sx:e.clientX,sy:e.clientY,ox:el.x,oy:el.y,ow:el.w,oh:el.h};}
function onMM(e){
  if(!_ds)return;
  var dx=e.clientX-_ds.sx,dy=e.clientY-_ds.sy,s=_cscale||1;
  if(_dragging){_ds.el.x=Math.round(_ds.ox+dx/s);_ds.el.y=Math.round(_ds.oy+dy/s);_ds.dom.style.left=_ds.el.x+'px';_ds.dom.style.top=_ds.el.y+'px';updSelBox();}
  if(_resizing&&_rh){
    var h=_rh;if(h.indexOf('e')>=0)_ds.el.w=Math.max(20,Math.round(_ds.ow+dx/s));
    if(h.indexOf('w')>=0){_ds.el.w=Math.max(20,Math.round(_ds.ow-dx/s));_ds.el.x=_ds.ox+(_ds.ow-_ds.el.w);}
    if(h.indexOf('s')>=0)_ds.el.h=Math.max(12,Math.round(_ds.oh+dy/s));
    if(h.indexOf('n')>=0){_ds.el.h=Math.max(12,Math.round(_ds.oh-dy/s));_ds.el.y=_ds.oy+(_ds.oh-_ds.el.h);}
    _ds.dom.style.left=_ds.el.x+'px';_ds.dom.style.top=_ds.el.y+'px';_ds.dom.style.width=_ds.el.w+'px';_ds.dom.style.height=_ds.el.h+'px';updSelBox();
  }
}
function onMU(){_dragging=false;_resizing=false;_rh=null;_ds=null;}

/* ── 选择 & 选择框 ── */
function selEl(id){_selId=id;showSelBox(id);switchTab(_activeTab);updateStatusBar();}
function showSelBox(id){
  var old=document.getElementById('ssSB');if(old)old.remove();
  if(!id)return;
  var el=findEl(id);if(!el)return;
  var box=document.createElement('div');box.id='ssSB';
  box.style.cssText='position:absolute;left:'+(el.x-2)+'px;top:'+(el.y-2)+'px;width:'+(el.w+4)+'px;height:'+(el.h+4)+'px;border:2px solid #2c7a6e;border-radius:2px;pointer-events:none;z-index:9999;';
  ['nw','n','ne','e','se','s','sw','w'].forEach(function(dir){
    var h=document.createElement('div');h.style.cssText=hStyle(dir);h.style.cursor=dir+'-resize';h.style.pointerEvents='auto';
    h.addEventListener('mousedown',function(e){e.stopPropagation();var dm=document.getElementById(id);if(dm)startResize(e,dir,dm,el);});
    box.appendChild(h);
  });
  var ci=document.getElementById('ssCI');if(ci)ci.appendChild(box);
}
function hStyle(dir){
  var s=8,m={nw:'left:-4px;top:-4px;',n:'left:50%;top:-4px;margin-left:-4px;',ne:'right:-4px;top:-4px;',e:'right:-4px;top:50%;margin-top:-4px;',se:'right:-4px;bottom:-4px;',s:'left:50%;bottom:-4px;margin-left:-4px;',sw:'left:-4px;bottom:-4px;',w:'left:-4px;top:50%;margin-top:-4px;'};
  return 'position:absolute;width:'+s+'px;height:'+s+'px;background:#2c7a6e;border:1px solid #fff;border-radius:1px;'+(m[dir]||'');
}
function updSelBox(){if(!_selId)return;var el=findEl(_selId);if(!el)return;var box=document.getElementById('ssSB');if(!box){showSelBox(_selId);return;}box.style.left=(el.x-2)+'px';box.style.top=(el.y-2)+'px';box.style.width=(el.w+4)+'px';box.style.height=(el.h+4)+'px';}

/* ── 辅助函数 ── */
function findEl(id){if(!_data)return null;var sl=_data.slides[curIdx()];if(!sl)return null;return(sl.elements||[]).find(function(e){return e.id===id})||null;}
function pushUndo(){if(!_data)return;try{var snap=JSON.stringify(_data);_undoStack.push(snap);if(_undoStack.length>_UNDO_MAX)_undoStack.shift();_redoStack=[];}catch(e){}}
function undo(){if(!_undoStack.length)return;try{_redoStack.push(JSON.stringify(_data));_data=JSON.parse(_undoStack.pop());_selId=null;renderCanvas();refreshThumbs();switchTab(_activeTab);updateStatusBar();}catch(e){}}
function redo(){if(!_redoStack.length)return;try{_undoStack.push(JSON.stringify(_data));_data=JSON.parse(_redoStack.pop());_selId=null;renderCanvas();refreshThumbs();switchTab(_activeTab);updateStatusBar();}catch(e){}}
function curIdx(){if(!_data||!_data.slides||!_data.slides.length)return 0;
  var its=document.querySelectorAll('#ssTL>div');for(var i=0;i<its.length;i++){if(its[i].style.borderColor==='#2c7a6e'||its[i].style.borderColor==='rgb(44, 122, 110)')return i;}
  return 0;}
function selectSlide(i){var its=document.querySelectorAll('#ssTL>div');its.forEach(function(it){it.style.borderColor='#1c3a42';});if(its[i])its[i].style.borderColor='#2c7a6e';renderCanvas();_selId=null;switchTab(_activeTab);updateStatusBar();}
function delSel(){if(!_selId||!_data)return;var sl=_data.slides[curIdx()];if(!sl)return;var idx=(sl.elements||[]).findIndex(function(e){return e.id===_selId;});if(idx>-1){pushUndo();sl.elements.splice(idx,1);_selId=null;renderCanvas();switchTab(_activeTab);updateStatusBar();refreshThumbs();}}
function dupSel(){if(!_selId||!_data)return;var el=findEl(_selId);if(!el)return;var sl=_data.slides[curIdx()];if(!sl)return;pushUndo();var c=JSON.parse(JSON.stringify(el));c.id=gid();c.x+=20;c.y+=20;sl.elements.push(c);renderCanvas();showSelBox(c.id);_selId=c.id;switchTab(_activeTab);updateStatusBar();}







function addElToSlide(type,stype){
  if(!_data)return;var sl=_data.slides[curIdx()];if(!sl)return;var t=getTheme();
  if(type!=='text'&&type!=='shape')return;
  pushUndo();
  if(type==='text'){sl.elements.push(mkText(SW*0.2,SH*0.3,SW*0.5,50,t));}
  else if(type==='shape'){sl.elements.push(mkShape(stype||'rect',SW*0.3,SH*0.3,120,80,t));}
  renderCanvas();refreshThumbs();
}

function addImgToSlide(){
  if(!_data)return;
  var input=document.createElement('input');input.type='file';input.accept='image/*';
  input.addEventListener('change',function(){
    if(input.files&&input.files[0]){
      var reader=new FileReader();reader.onload=function(e){
        var sl=_data.slides[curIdx()];if(sl){pushUndo();sl.elements.push(mkImg(e.target.result,SW*0.25,SH*0.25,200,150));renderCanvas();refreshThumbs();}
      };reader.readAsDataURL(input.files[0]);
    }
  });input.click();
}

function startSlideDraw(){
  if(_drawActive)return;
  var ci=document.getElementById('ssCI');if(!ci)return;
  if(_drawCanvas&&_drawCanvas.parentNode===ci){_drawActive=true;_drawCanvas.style.pointerEvents='auto';return;}
  _drawCanvas=document.createElement('canvas');
  _drawCanvas.width=SW;_drawCanvas.height=SH;
  _drawCanvas.style.cssText='position:absolute;left:0;top:0;width:'+SW+'px;height:'+SH+'px;z-index:9000;pointer-events:auto;cursor:crosshair;';
  ci.appendChild(_drawCanvas);
  _drawCtx=_drawCanvas.getContext('2d');
  _drawActive=true;_drawHistory=[];_drawHistoryIdx=-1;_drawIsDrawing=false;
  _drawCanvas.onpointerdown=function(e){
    if(e.button!==0)return;e.preventDefault();e.stopPropagation();_drawIsDrawing=true;_drawCanvas.setPointerCapture(e.pointerId);
    var r=_drawCanvas.getBoundingClientRect(),sx=SW/r.width,sy=SH/r.height;
    _drawLastX=(e.clientX-r.left)*sx;_drawLastY=(e.clientY-r.top)*sy;
    if(_drawTool==='pencil'){_drawCtx.globalCompositeOperation='source-over';slideDrawPencilTexture(_drawLastX,_drawLastY,Math.max(1,_drawSize*0.8),_drawColor);_drawCtx.globalAlpha=1;}
    else if(_drawTool==='highlighter'){slideDrawEnsureTemp();_drawTempCtx.lineCap='round';_drawTempCtx.lineJoin='round';_drawTempCtx.lineWidth=_drawSize*4;_drawTempCtx.strokeStyle=_drawColor;_drawTempCtx.globalAlpha=1;_drawTempCtx.globalCompositeOperation='source-over';_drawTempCtx.setLineDash([]);_drawTempCtx.beginPath();_drawTempCtx.moveTo(_drawLastX,_drawLastY);}
    else if(_drawTool==='rainbow'){_drawCtx.globalCompositeOperation='source-over';_drawCtx.lineCap='round';_drawCtx.lineJoin='round';_drawCtx.lineWidth=_drawSize;_drawCtx.globalAlpha=1;_drawCtx.setLineDash([]);_drawRainbowHue=0;_drawCtx.strokeStyle=slideDrawHSL(_drawRainbowHue,100,50);_drawCtx.beginPath();_drawCtx.moveTo(_drawLastX,_drawLastY);}
    else if(_drawTool==='eraser'){_drawCtx.globalCompositeOperation='destination-out';_drawCtx.lineWidth=_drawSize*6;_drawCtx.globalAlpha=1;_drawCtx.lineCap='round';_drawCtx.lineJoin='round';_drawCtx.setLineDash([]);_drawCtx.beginPath();_drawCtx.moveTo(_drawLastX,_drawLastY);}
    else{_drawCtx.globalCompositeOperation='source-over';_drawCtx.strokeStyle=_drawColor;_drawCtx.globalAlpha=1;_drawCtx.lineWidth=_drawSize;_drawCtx.lineCap='round';_drawCtx.lineJoin='round';if(_drawLineStyle==='dashed')_drawCtx.setLineDash([12,6]);else if(_drawLineStyle==='dotted')_drawCtx.setLineDash([3,6]);else _drawCtx.setLineDash([]);_drawCtx.beginPath();_drawCtx.moveTo(_drawLastX,_drawLastY);}
  };
  _drawCanvas.onpointermove=function(e){
    if(!_drawIsDrawing)return;var r=_drawCanvas.getBoundingClientRect(),sx=SW/r.width,sy=SH/r.height;
    var px=(e.clientX-r.left)*sx,py=(e.clientY-r.top)*sy;
    if(_drawTool==='pencil'){slideDrawPencilSeg(_drawLastX,_drawLastY,px,py,Math.max(1,_drawSize*0.8),_drawColor);}
    else if(_drawTool==='highlighter'){if(_drawTempCtx){_drawTempCtx.lineTo(px,py);_drawTempCtx.stroke();}}
    else if(_drawTool==='rainbow'){_drawRainbowHue=(_drawRainbowHue+2)%360;_drawCtx.strokeStyle=slideDrawHSL(_drawRainbowHue,100,50);_drawCtx.beginPath();_drawCtx.moveTo(_drawLastX,_drawLastY);_drawCtx.lineTo(px,py);_drawCtx.stroke();}
    else{_drawCtx.lineTo(px,py);_drawCtx.stroke();}
    _drawLastX=px;_drawLastY=py;
  };
  _drawCanvas.onpointerup=function(e){
    if(!_drawIsDrawing)return;_drawIsDrawing=false;
    if(_drawTool==='highlighter'&&_drawTempCanvas&&_drawTempCtx){_drawCtx.globalCompositeOperation='source-over';_drawCtx.globalAlpha=0.35;_drawCtx.drawImage(_drawTempCanvas,0,0);_drawCtx.globalAlpha=1;_drawTempCtx.clearRect(0,0,_drawTempCanvas.width,_drawTempCanvas.height);slideDrawRemoveTemp();}
    _drawCtx.globalAlpha=1;_drawCtx.globalCompositeOperation='source-over';_drawCtx.setLineDash([]);slideDrawSaveState();
  };
}

function stopSlideDraw(){
  _drawActive=false;slideDrawRemoveTemp();
  if(_drawCanvas){_drawCanvas.style.pointerEvents='none';_drawCanvas.style.cursor='default';}
  _drawIsDrawing=false;
}

function slideDrawEnsureTemp(){if(!_drawCanvas)return;if(_drawTempCanvas&&_drawTempCanvas.parentNode)return;_drawTempCanvas=document.createElement('canvas');_drawTempCanvas.width=SW;_drawTempCanvas.height=SH;_drawTempCanvas.style.cssText='position:absolute;left:0;top:0;width:100%;height:100%;z-index:9001;pointer-events:none;';_drawCanvas.parentNode.appendChild(_drawTempCanvas);_drawTempCtx=_drawTempCanvas.getContext('2d');}
function slideDrawRemoveTemp(){if(_drawTempCanvas&&_drawTempCanvas.parentNode)_drawTempCanvas.parentNode.removeChild(_drawTempCanvas);_drawTempCanvas=null;_drawTempCtx=null;}
function slideDrawPencilTexture(x,y,sz,col){var c=Math.max(2,Math.floor(sz*3));for(var i=0;i<c;i++){var a=Math.random()*Math.PI*2,d=Math.random()*sz*1.5;_drawCtx.globalAlpha=Math.random()*0.4+0.2;_drawCtx.fillStyle=col;_drawCtx.beginPath();_drawCtx.arc(x+Math.cos(a)*d,y+Math.sin(a)*d,Math.random()*sz*0.3+0.3,0,Math.PI*2);_drawCtx.fill();}}
function slideDrawPencilSeg(x0,y0,x1,y1,sz,col){var dx=x1-x0,dy=y1-y0,dist=Math.sqrt(dx*dx+dy*dy),steps=Math.max(1,Math.floor(dist/2));for(var s=0;s<=steps;s++){var t=steps===0?0:s/steps;slideDrawPencilTexture(x0+dx*t,y0+dy*t,sz,col);}}
function slideDrawHSL(h,s,l){s/=100;l/=100;var a=s*Math.min(l,1-l);var f=function(n){var k=(n+h/30)%12;var c=l-a*Math.max(Math.min(k-3,9-k,1),-1);return Math.round(255*c).toString(16).padStart(2,'0');};return'#'+f(0)+f(8)+f(4);}
function slideDrawSaveState(){if(!_drawCanvas||!_drawCtx)return;var du=_drawCanvas.toDataURL('image/png');_drawHistory=_drawHistory.slice(0,_drawHistoryIdx+1);_drawHistory.push(du);_drawHistoryIdx=_drawHistory.length-1;}
function slideDrawUndo(){if(!_drawCtx||!_drawCanvas)return;if(_drawHistoryIdx<=0){_drawCtx.clearRect(0,0,_drawCanvas.width,_drawCanvas.height);_drawHistoryIdx=-1;return;}_drawHistoryIdx--;var img=new Image();img.onload=function(){_drawCtx.clearRect(0,0,_drawCanvas.width,_drawCanvas.height);_drawCtx.drawImage(img,0,0);};img.src=_drawHistory[_drawHistoryIdx];}
function slideDrawRedo(){if(_drawHistoryIdx>=_drawHistory.length-1)return;_drawHistoryIdx++;var img=new Image();img.onload=function(){if(_drawCtx&&_drawCanvas){_drawCtx.clearRect(0,0,_drawCanvas.width,_drawCanvas.height);_drawCtx.drawImage(img,0,0);}};img.src=_drawHistory[_drawHistoryIdx];}
function slideDrawClear(){if(!_drawCtx||!_drawCanvas)return;_drawCtx.clearRect(0,0,_drawCanvas.width,_drawCanvas.height);_drawHistory=[];_drawHistoryIdx=-1;}
function saveSlideDrawAsElement(){if(!_drawCanvas||!_data)return;var du=_drawCanvas.toDataURL('image/png');var sl=_data.slides[curIdx()];if(!sl)return;sl.elements.push({id:gid(),type:'image',src:du,x:0,y:0,w:SW,h:SH,rotation:0,opacity:1,fit:'contain',br:0,shadow:{en:false,bl:4,oX:2,oY:2,c:'rgba(0,0,0,0.3)'},anim:{enter:'fadeIn',exit:'none',em:'none',delay:0,dur:500}});stopSlideDraw();if(_drawCanvas&&_drawCanvas.parentNode)_drawCanvas.parentNode.removeChild(_drawCanvas);_drawCanvas=null;_drawCtx=null;renderCanvas();refreshThumbs();}

/* ── 导出 PPTX（基础版）── */
function exportPptx(d){
  alert('PPTX 导出功能开发中...\n\n当前版本支持：\n- 在线预览（全屏演示）\n- 导出 PDF（浏览器打印）\n\n完整 PPTX 导出需要引入 PptxGenJS 库，后续版本将集成。');
}

/* ── 导出 PDF ── */
function exportPdf(d){
  var ov=document.createElement('div');ov.id='pptPdfExport';
  ov.style.cssText='position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:999998;background:#fff;display:flex;flex-direction:column;';

  var tb=document.createElement('div');tb.style.cssText='height:36px;background:#333;display:flex;align-items:center;padding:0 16px;gap:10px;';
  var xb=document.createElement('button');xb.textContent='关闭预览';xb.style.cssText='padding:4px 12px;border:1px solid #666;border-radius:3px;background:#555;color:#fff;cursor:pointer;font-size:11px;';
  xb.addEventListener('click',function(){document.body.removeChild(ov);});
  var pb=document.createElement('button');pb.textContent='打印 / 保存为 PDF (Ctrl+P)';pb.style.cssText='padding:4px 12px;border:1px solid #0a8a6e;border-radius:3px;background:#0a8a6e;color:#fff;cursor:pointer;font-size:11px;';
  pb.addEventListener('click',function(){window.print();});
  tb.appendChild(xb);tb.appendChild(pb);ov.appendChild(tb);

  var area=document.createElement('div');area.style.cssText='flex:1;overflow:auto;padding:20px;display:flex;flex-direction:column;align-items:center;background:#ddd;';

  var slides=d.slides||[];
  slides.forEach(function(slide,i){
    var page=document.createElement('div');
    page.style.cssText='width:960px;height:540px;margin-bottom:20px;box-shadow:0 2px 12px rgba(0,0,0,0.2);page-break-after:always;position:relative;overflow:hidden;';
    var content=buildHTML(slide,true);
    content.style.width='100%';content.style.height='100%';
    page.appendChild(content);
    area.appendChild(page);
  });

  ov.appendChild(area);document.body.appendChild(ov);
}
