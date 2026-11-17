/* The Handyman Accountancy — central PDF/Print Engine
 * Preview R27: PDF.js provides the responsive preview; Print shares the original
 * multi-page PDF file through the iOS-native share sheet (Print action), avoiding
 * Safari's single-page iframe print path. Back returns to the report.
 */
(function installTHAPrintEngine(){
 'use strict';
 if(window.THA&&window.THA.PrintEngine)return;
 const state={overlay:null,objectUrl:null,pdfBlob:null,pdfFile:null,pdfDocument:null,returnFocus:null,host:null,resizeObserver:null,resizeTimer:null,renderToken:0,renderTask:null,lastWidth:0};
 const A4={unit:'mm',format:'a4',orientation:'portrait'};
 const PDFJS_VERSION='3.11.174';
 function ensureStyles(){
  if(document.getElementById('tha-print-engine-style'))return;
  const style=document.createElement('style');style.id='tha-print-engine-style';
  style.textContent=`
  .tha-pe-overlay{position:fixed;inset:0;z-index:2147483646;background:#eef1f5;display:flex;flex-direction:column;min-width:0;min-height:0;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);font-family:-apple-system,BlinkMacSystemFont,Arial,sans-serif;color:#142b4a;overflow:hidden}
  .tha-pe-bar{position:relative;z-index:2;min-height:48px;display:flex;align-items:center;gap:10px;padding:7px 12px;background:#fff;border-bottom:1px solid #d7dee8}
  .tha-pe-title{font-size:16px;font-weight:800;flex:1;min-width:0}
  .tha-pe-status{position:relative;z-index:2;flex:0 0 auto;padding:9px 12px;background:#f7f9fc;color:#34445a;font-size:13px;line-height:1.4;border-bottom:1px solid #d7dee8}
  .tha-pe-pages{position:relative;z-index:1;display:block;flex:1 1 auto;width:100%;min-width:0;min-height:0;box-sizing:border-box;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:12px 8px 18px;background:#e9edf3}
  .tha-pe-page{display:block;width:100%;max-width:900px;box-sizing:border-box;margin:0 auto 14px;padding:0;background:#fff;box-shadow:0 2px 10px rgba(20,43,74,.16);overflow:hidden}
  .tha-pe-page canvas{display:block;width:100%;max-width:100%;height:auto!important;margin:0 auto;background:#fff}
  .tha-pe-error{margin:12px;padding:14px;border:1px solid #e2a09a;border-radius:10px;background:#fff1f0;color:#8b1e16;font-size:14px;line-height:1.5;overflow-wrap:anywhere}
  .tha-pe-actions{position:relative;z-index:2;display:flex;flex:0 0 auto;flex-wrap:nowrap;gap:10px;justify-content:center;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid #d7dee8}
  .tha-pe-actions button{min-height:54px;flex:1 1 0;min-width:0;max-width:420px;border:0;border-radius:12px;padding:10px 16px;background:#e5b63f;color:#142b4a;font-size:18px;font-weight:800;box-shadow:0 4px 0 rgba(20,43,74,.12)}
  .tha-pe-actions button:disabled{opacity:.48}
  .tha-pe-actions .tha-pe-secondary{background:#e8edf4;color:#24364f}
  .tha-pe-overlay[hidden]{display:none!important}
  @media(max-width:560px){.tha-pe-bar{min-height:42px}.tha-pe-pages{padding:8px 5px 14px}.tha-pe-page{margin-bottom:10px}.tha-pe-actions{gap:9px;padding-left:12px;padding-right:12px}.tha-pe-actions button{min-height:52px;font-size:17px}}
  `;
  document.head.appendChild(style);
 }
 function setStatus(message){const el=state.overlay&&state.overlay.querySelector('.tha-pe-status');if(el)el.textContent=message}
 function loadPdfJs(){
  if(window.pdfjsLib&&window.pdfjsLib.getDocument)return Promise.resolve(window.pdfjsLib);
  if(window.__thaPdfJsPromise)return window.__thaPdfJsPromise;
  window.__thaPdfJsPromise=new Promise((resolve,reject)=>{
   const existing=document.querySelector('script[data-tha-pdfjs]');
   if(existing){existing.addEventListener('load',()=>window.pdfjsLib?resolve(window.pdfjsLib):reject(new Error('PDF.js did not initialize')),{once:true});existing.addEventListener('error',()=>reject(new Error('PDF.js failed to load')),{once:true});return}
   const script=document.createElement('script');script.dataset.thaPdfjs='1';script.crossOrigin='anonymous';
   script.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/'+PDFJS_VERSION+'/pdf.min.js';
   script.onload=()=>window.pdfjsLib?resolve(window.pdfjsLib):reject(new Error('PDF.js loaded without its viewer API'));
   script.onerror=()=>reject(new Error('PDF.js could not load. Check the internet connection and retry.'));
   document.head.appendChild(script);
  }).then(pdfjs=>{
   pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/'+PDFJS_VERSION+'/pdf.worker.min.js';
   return pdfjs;
  }).catch(error=>{window.__thaPdfJsPromise=null;throw error});
  return window.__thaPdfJsPromise;
 }
 function mountOverlay(title){
  ensureStyles();
  if(state.overlay)close();
  state.returnFocus=document.activeElement;
  const overlay=document.createElement('section');overlay.className='tha-pe-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label',title||'PDF Preview');
  overlay.innerHTML='<header class="tha-pe-bar"><strong class="tha-pe-title"></strong></header><div class="tha-pe-status" role="status" aria-live="polite">Preparing PDF preview…</div><main class="tha-pe-pages" aria-label="PDF pages"></main><footer class="tha-pe-actions"><button type="button" class="tha-pe-secondary" data-action="back" disabled>Back</button><button type="button" data-action="print" disabled>Print</button></footer>';
  overlay.querySelector('.tha-pe-title').textContent=title||'PDF Preview';
  overlay.querySelector('[data-action="back"]').addEventListener('click',close);
  overlay.querySelector('[data-action="print"]').addEventListener('click',print);
  overlay.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close()}});
  document.body.appendChild(overlay);state.overlay=overlay;return overlay;
 }
 function enableActions(){if(!state.overlay)return;state.overlay.querySelectorAll('[data-action]').forEach(button=>button.disabled=false)}
 function cleanupCapture(){if(state.host&&state.host.parentNode)state.host.parentNode.removeChild(state.host);state.host=null}
 function stopRendering(){
  state.renderToken++;
  if(state.renderTask){try{state.renderTask.cancel()}catch(_){}state.renderTask=null}
  if(state.resizeObserver){state.resizeObserver.disconnect();state.resizeObserver=null}
  if(state.resizeTimer){clearTimeout(state.resizeTimer);state.resizeTimer=null}
 }
 function close(){
  stopRendering();cleanupCapture();
  if(state.pdfDocument){try{state.pdfDocument.destroy()}catch(_){}state.pdfDocument=null}
  if(state.objectUrl){try{URL.revokeObjectURL(state.objectUrl)}catch(_){}}
  state.objectUrl=null;state.pdfBlob=null;state.pdfFile=null;state.lastWidth=0;
  if(state.overlay){state.overlay.remove();state.overlay=null}
  const focus=state.returnFocus;state.returnFocus=null;
  if(focus&&typeof focus.focus==='function'){try{focus.focus({preventScroll:true})}catch(_){try{focus.focus()}catch(__){}}}
 }
 async function waitForAssets(root){
  if(document.fonts&&document.fonts.ready)await document.fonts.ready;
  const images=[...root.querySelectorAll('img')];
  await Promise.all(images.map(async img=>{
   if(img.complete&&img.naturalWidth>0)return;
   if(typeof img.decode==='function'){try{await img.decode();return}catch(_){}}
   await new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});setTimeout(resolve,5000)});
  }));
 }
 async function renderPages(){
  if(!state.pdfDocument||!state.overlay)return;
  const viewer=state.overlay.querySelector('.tha-pe-pages');if(!viewer)return;
  const width=Math.max(240,viewer.clientWidth-16);if(!width)return;
  const token=++state.renderToken;
  if(state.renderTask){try{state.renderTask.cancel()}catch(_){}state.renderTask=null}
  viewer.innerHTML='';
  setStatus('Fitting PDF pages to screen width…');
  const pdf=state.pdfDocument;
  try{
   for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
    if(token!==state.renderToken||!state.overlay)return;
    const page=await pdf.getPage(pageNumber);
    const base=page.getViewport({scale:1});
    const cssScale=width/base.width;
    const outputScale=Math.min(window.devicePixelRatio||1,1.5);
    const viewport=page.getViewport({scale:cssScale*outputScale});
    const wrapper=document.createElement('section');wrapper.className='tha-pe-page';wrapper.setAttribute('aria-label','Page '+pageNumber+' of '+pdf.numPages);
    const canvas=document.createElement('canvas');canvas.setAttribute('role','img');canvas.setAttribute('aria-label','PDF page '+pageNumber);
    canvas.width=Math.max(1,Math.ceil(viewport.width));canvas.height=Math.max(1,Math.ceil(viewport.height));
    canvas.style.width=Math.floor(base.width*cssScale)+'px';canvas.style.height=Math.floor(base.height*cssScale)+'px';
    wrapper.appendChild(canvas);viewer.appendChild(wrapper);
    const context=canvas.getContext('2d',{alpha:false});
    const task=page.render({canvasContext:context,viewport,background:'rgb(255,255,255)'});
    state.renderTask=task;
    await task.promise;
    state.renderTask=null;
    if(token!==state.renderToken)return;
    page.cleanup();
   }
   state.lastWidth=viewer.clientWidth;
   setStatus('PDF preview ready. Pages are fitted to your screen. Use Back or Print.');
   enableActions();
   return true;
  }catch(error){
   if(error&&error.name==='RenderingCancelledException')return;
   if(token!==state.renderToken)return;
   viewer.innerHTML='<div class="tha-pe-error">PDF preview could not be displayed: '+String(error&&error.message||error).replace(/[<>&"]/g,char=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[char]))+'</div>';
   setStatus('PDF was created, but the responsive preview failed.');
   return false;
  }
 }
 function observeViewer(){
  if(!state.overlay)return;
  const viewer=state.overlay.querySelector('.tha-pe-pages');
  if(!viewer)return;
  if(typeof ResizeObserver==='function'){
   state.resizeObserver=new ResizeObserver(()=>{
    if(!state.pdfDocument||!state.overlay)return;
    const width=viewer.clientWidth;
    if(Math.abs(width-state.lastWidth)>3){
     if(state.resizeTimer)clearTimeout(state.resizeTimer);
     state.resizeTimer=setTimeout(()=>{state.resizeTimer=null;renderPages()},180);
    }
   });
   state.resizeObserver.observe(viewer);
  }else{
   window.addEventListener('resize',()=>{
    if(!state.pdfDocument||!state.overlay)return;
    if(state.resizeTimer)clearTimeout(state.resizeTimer);
    state.resizeTimer=setTimeout(()=>{state.resizeTimer=null;renderPages()},180);
   },{passive:true});
  }
 }
 async function open(options){
  const o=options||{};
  if(!o.node||!o.node.nodeType)throw new Error('A document node is required for PDF generation');
  const filename=String(o.filename||'The-Handyman-Document.pdf');
  const overlay=mountOverlay(o.title||'PDF Preview');
  try{
   setStatus('Preparing document: waiting for fonts and images…');
   const captureHost=document.createElement('div');captureHost.style.cssText='position:fixed;left:-12000px;top:0;width:185mm;max-width:185mm;display:block;z-index:-1;background:#fff;overflow:visible';
   captureHost.appendChild(o.node);document.body.appendChild(captureHost);state.host=captureHost;
   await waitForAssets(o.node);
   const html2pdf=await (function loadHtml2Pdf(){
    if(window.html2pdf)return Promise.resolve(window.html2pdf);
    if(window.__thaPrintEngineLibraryPromise)return window.__thaPrintEngineLibraryPromise;
    window.__thaPrintEngineLibraryPromise=new Promise((resolve,reject)=>{
     const existing=document.querySelector('script[data-tha-print-engine-library]');
     if(existing){existing.addEventListener('load',()=>resolve(window.html2pdf),{once:true});existing.addEventListener('error',()=>reject(new Error('PDF generation library failed to load')),{once:true});return}
     const script=document.createElement('script');script.dataset.thaPrintEngineLibrary='1';script.crossOrigin='anonymous';
     script.src='https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
     script.onload=()=>window.html2pdf?resolve(window.html2pdf):reject(new Error('PDF generation library loaded without html2pdf'));
     script.onerror=()=>reject(new Error('PDF generation library failed to load'));
     document.head.appendChild(script);
    }).catch(error=>{window.__thaPrintEngineLibraryPromise=null;throw error});
    return window.__thaPrintEngineLibraryPromise;
   })();
   setStatus('Generating A4 PDF… Please keep this page open.');
   const opts={margin:o.margin||[12,7,12,7],filename,image:{type:'jpeg',quality:.98},html2canvas:{scale:1,useCORS:true,backgroundColor:'#fff',logging:false,scrollX:0,scrollY:0,windowWidth:794},jsPDF:A4,pagebreak:{mode:['css'],avoid:['.uc-head','.uc-group tr','.uc-summary tr','.uc-details tbody tr']},...(o.options||{})};
   const blob=await html2pdf().set(opts).from(o.node).outputPdf('blob');
   if(!blob||blob.type!=='application/pdf'||blob.size<1000)throw new Error('Generated PDF is empty or invalid');
   const signature=new Uint8Array(await blob.slice(0,5).arrayBuffer());
   if(String.fromCharCode(...signature)!=='%PDF-')throw new Error('Generated file failed PDF signature validation');
   state.pdfBlob=blob;state.pdfFile=new File([blob],filename,{type:'application/pdf'});
   state.objectUrl=URL.createObjectURL(blob);
   setStatus('Loading responsive PDF viewer…');
   const pdfjs=await loadPdfJs();
   const bytes=new Uint8Array(await blob.arrayBuffer());
   const loadingTask=pdfjs.getDocument({data:bytes,useSystemFonts:true,isEvalSupported:false});
   state.pdfDocument=await loadingTask.promise;
   cleanupCapture();
   const rendered=await renderPages();
   if(!rendered)throw new Error('Responsive PDF page rendering failed');
   observeViewer();
   return {ok:true,filename,size:blob.size,pages:state.pdfDocument.numPages,viewer:'pdfjs-fit-width'};
  }catch(error){
   cleanupCapture();
   setStatus('PDF preview could not be created: '+(error&&error.message?error.message:'unknown error'));
   const viewer=overlay.querySelector('.tha-pe-pages');
   if(viewer)viewer.innerHTML='<div class="tha-pe-error">PDF preview could not be created. '+String(error&&error.message||error).replace(/[<>&"]/g,char=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[char]))+'</div>';
   throw error;
  }
 }
 async function print(){
  if(!state.pdfBlob||!state.pdfFile||!state.objectUrl)return;
  const expectedPages=state.pdfDocument?state.pdfDocument.numPages:0;
  if(!expectedPages){setStatus('The PDF is not ready to print. Please wait for all pages to finish loading.');return}
  const button=state.overlay&&state.overlay.querySelector('[data-action="print"]');
  if(button)button.disabled=true;
  const nativeShare=!!(navigator.share&&(!navigator.canShare||navigator.canShare({files:[state.pdfFile]})));
  if(nativeShare){
   setStatus('Opening the iPhone share sheet with the complete '+expectedPages+'-page PDF. Select Print to continue.');
   try{
    await navigator.share({files:[state.pdfFile],title:state.pdfFile.name});
    setStatus('The complete PDF was handed to the iOS share sheet. If you selected Print, choose your printer and page range.');
   }catch(error){
    if(error&&error.name==='AbortError'){
     setStatus('Sharing was cancelled. The original PDF is unchanged; tap Print to try again.');
    }else{
     setStatus('The iOS share sheet was unavailable. Opening the complete PDF in Safari instead.');
     const tab=window.open(state.objectUrl,'_blank');
     if(!tab)setStatus('Safari blocked the PDF tab. Use the browser Share option to open or print the PDF.');
    }
   }
  }else{
   const tab=window.open(state.objectUrl,'_blank');
   if(tab)setStatus('The complete '+expectedPages+'-page PDF is open in Safari. Use Share, then Print.');
   else setStatus('Safari blocked the PDF tab. Allow pop-ups, then tap Print again.');
  }
  if(button&&state.overlay)button.disabled=false;
 }
 window.THA=window.THA||{};
 window.THA.PrintEngine=Object.freeze({open,close,getState:()=>Object.freeze({open:!!state.overlay,ready:!!state.pdfBlob,pages:state.pdfDocument?state.pdfDocument.numPages:0,viewer:'pdfjs-fit-width'})});
})();