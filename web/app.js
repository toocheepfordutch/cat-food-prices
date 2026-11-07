(function(){
  "use strict";
  var D = JSON.parse(document.getElementById("site-data").textContent);
  var $ = function(s){return document.querySelector(s);};
  function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}

  // ── 語言：中文（繁體）／English／Nederlands ─────────────────────────────
  // 預設依裝置語言（navigator.languages 中第一個 zh／nl／en），手動選擇存在 localStorage（catfood.lang.v1）
  var LKEY="catfood.lang.v1", LANGS=["zh","en","nl"], HTML_LANG={zh:"zh-Hant-TW",en:"en",nl:"nl"}, SHORT={zh:"中",en:"EN",nl:"NL"};
  function deviceLang(){
    var l=(navigator.languages&&navigator.languages.length)?navigator.languages:[navigator.language||""];
    for(var i=0;i<l.length;i++){ var c=String(l[i]||"").toLowerCase();
      if(c.indexOf("zh")===0) return "zh"; if(c.indexOf("nl")===0) return "nl"; if(c.indexOf("en")===0) return "en"; }
    return "en";
  }
  var LANG=(function(){ try{ var s=localStorage.getItem(LKEY); if(LANGS.indexOf(s)>=0) return s; }catch(e){} return deviceLang(); })();
  var UI=D.ui||{}, I18N=D.i18n||{};
  function LI(){return LANGS.indexOf(LANG);}
  // 介面文字：t("key", 代入值…)；缺翻譯時用中文
  function t(k){
    var row=UI[k]; var s=row?(row[LI()]||row[0]):k;
    for(var i=1;i<arguments.length;i++) s=s.split("{"+(i-1)+"}").join(arguments[i]);
    return s;
  }
  // 資料文字（prices.json 的中文）：build.py 產生的對照表，找不到就顯示原文
  function tr(s){ if(s==null||LANG==="zh") return s; var m=I18N[LANG]; return (m&&Object.prototype.hasOwnProperty.call(m,s))?m[s]:s; }
  function eur(v,d){ if(v==null) return "—"; var s=Number(v).toFixed(d==null?2:d); return "€"+(LANG==="nl"?s.replace(".",","):s); }
  var MON={en:["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],nl:["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"]};
  function dayMonth(iso){ if(!iso) return ""; var p=iso.split("-"), m=+p[1], d=+p[2]; return LANG==="zh"?m+"月"+d+"日":d+" "+MON[LANG][m-1]; }
  // 標點：中文維持全形（・、：（）），英荷用半形
  function DOT(){return LANG==="zh"?"・":" · ";}
  function LSEP(){return LANG==="zh"?"、":", ";}
  function COL(){return LANG==="zh"?"：":": ";}
  function PAR(h){return LANG==="zh"?"（"+h+"）":" ("+h+")";}
  function shortDate(iso){ var p=iso.split("-"), m=+p[1], d=+p[2]; return LANG==="zh"?m+"/"+d:d+" "+MON[LANG][m-1]; }

  function variant(v){return esc(String(tr(v)||"").replace(/(\d)\s*x\s*(\d)/gi,"$1×$2"));}
  function unitW(p){return tr(p.unit_word);}
  function pB(p,v){return v==null?"—":'<b class="p100 num">'+eur(v,bd(p))+'<span class="u100">/'+bu(p)+'</span></b>';}
  // 比價單位：濕食每 100g；其他商品每 g（3 位小數）或每公升
  var BASE_LBL={"100g":"100g","g":"g","kg":"kg","L":"L"}, BASE_KEY={"100g":"per_100g","g":"per_g","kg":"per_kg","L":"per_L","capsule":"per_capsule"};
  function bu(p){return p.base==="capsule"?t("u_capsule"):(BASE_LBL[p.base]||"100g");}
  function sz(p,s){return (s&&p.base==="capsule")?s.replace(/ caps$/," "+t("u_capsule")):s;}
  function bz(p){return t(BASE_KEY[p.base]||"per_100g");}
  function bd(p){return p.base==="g"?3:2;}
  function pbv(o){return o.pb!=null?o.pb:o.per100g;}
  var ARROW='<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.2 5.3a1 1 0 0 1 1.4 0l6 6a1 1 0 0 1 0 1.4l-6 6a1 1 0 1 1-1.4-1.4l4.3-4.3H4a1 1 0 1 1 0-2h13.5l-4.3-4.3a1 1 0 0 1 0-1.4z"/></svg>';
  var CHEV='<svg class="chev" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.3 9.3a1 1 0 0 1 1.4 0L12 13.6l4.3-4.3a1 1 0 1 1 1.4 1.4l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 0 1 0-1.4z"/></svg>';
  var PLACEHOLDER="data:image/svg+xml,"+encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='#f6efe8'/><text x='50' y='62' font-size='40' text-anchor='middle'>🐱</text></svg>");
  var TIP_URL="https://donate.stripe.com/14A28q0Hk2EweXg6pc1wY00";

  // 返現邀請連結（build.py 只輸出今日資料實際用到的網站）
  var INVITES = D.cashback_invites||[], INVITE={};
  INVITES.forEach(function(x){ INVITE[x.name]=x.url; });

  // 分類（build.py 依 prices.json 的 category）：濕食、乾飼料、貓砂、保健；沒有商品的分類不顯示。一次只顯示一個分類。
  var CATS=[{k:"wet",title:"food_title",nav:"nav_wet"},{k:"dry",title:"dry_title",nav:"nav_dry"},{k:"litter",title:"litter_title",nav:"nav_litter"},{k:"care",title:"care_title",nav:"nav_care"}];
  function catOf(p){ for(var i=0;i<CATS.length;i++) if(CATS[i].k===p.category) return p.category; return "wet"; }
  var SECTIONS=CATS.map(function(c){ return {k:c.k,title:c.title,nav:c.nav,items:D.products.filter(function(p){return catOf(p)===c.k;})}; }).filter(function(c){return c.items.length;});
  function secOf(k){ for(var i=0;i<SECTIONS.length;i++) if(SECTIONS[i].k===k) return SECTIONS[i]; return SECTIONS[0]; }
  function ls(k,v){ try{ if(v===undefined) return localStorage.getItem(k); if(v===null) localStorage.removeItem(k); else localStorage.setItem(k,v); }catch(e){} return null; }

  // 關注篩選：儲存「隱藏的商品」，因此之後新增的商品預設會顯示，已下架的商品自動忽略
  var FKEY="catfood.hidden.v1";
  var IDS=D.products.map(function(p){return p.id;});
  var hidden=loadHidden();
  function loadHidden(){
    try{
      var v=JSON.parse(ls(FKEY)||"[]");
      return Array.isArray(v)?v.filter(function(id){return IDS.indexOf(id)>=0;}):[];
    }catch(e){return [];}
  }
  function saveHidden(){ ls(FKEY, hidden.length?JSON.stringify(hidden):null); }

  // 目前分類（catfood.tab.v1）；篩選與排序（catfood.view.v1：{sort, f:{分類:{brand:[],age:[],deal}}}）
  var TKEY="catfood.tab.v1", VKEY="catfood.view.v1", SORTS=["cheap","drop","recent"], AGES=["kitten","adult","all"];
  var TAB=secOf(ls(TKEY)).k;
  var VIEW=(function(){ try{ var v=JSON.parse(ls(VKEY)||"{}"); if(v&&typeof v==="object") return {sort:SORTS.indexOf(v.sort)>=0?v.sort:"cheap", f:(v.f&&typeof v.f==="object")?v.f:{}}; }catch(e){} return {sort:"cheap",f:{}}; })();
  function saveView(){ ls(VKEY, JSON.stringify(VIEW)); }
  // 該分類可用的篩選：只有 2 種以上的值才顯示
  function facets(sec){
    var brands=[], ages=[], deals={};
    sec.items.forEach(function(p){ if(p.brand&&brands.indexOf(p.brand)<0) brands.push(p.brand); if(p.age&&ages.indexOf(p.age)<0) ages.push(p.age); deals[!!p.deal]=1; });
    ages=AGES.filter(function(a){return ages.indexOf(a)>=0;});
    return {brand:brands.length>1?brands:[], age:ages.length>1?ages:[], deal:!!(deals["true"]&&deals["false"])};
  }
  function filt(){
    var F=facets(secOf(TAB)), f=VIEW.f[TAB]||{};
    var r={brand:(f.brand||[]).filter(function(b){return F.brand.indexOf(b)>=0;}), age:(f.age||[]).filter(function(a){return F.age.indexOf(a)>=0;}), deal:F.deal&&!!f.deal};
    VIEW.f[TAB]=r; return r;
  }
  function nActive(f){ return f.brand.length+f.age.length+(f.deal?1:0); }
  // 年齡不明的商品照樣顯示；全齡商品也符合「幼貓」「成貓」
  function pass(p,f){
    if(f.brand.length&&f.brand.indexOf(p.brand)<0) return false;
    if(f.age.length&&p.age&&f.age.indexOf(p.age)<0&&!(p.age==="all")) return false;
    if(f.deal&&!p.deal) return false;
    return true;
  }
  function unitPrice(p){ var b=p.best; var v=b?pbv(b):null; return v==null?(b&&b.unit!=null?b.unit*1e6:Infinity):v; }
  function cmp(a,b){
    var s=VIEW.sort, d=0;
    if(s==="drop") d=(b.drop||0)-(a.drop||0);
    else if(s==="recent") d=(b.date||"")<(a.date||"")?-1:((b.date||"")>(a.date||"")?1:0);
    return d||(unitPrice(a)-unitPrice(b))||(D.products.indexOf(a)-D.products.indexOf(b));
  }

  // 語言切換器（頁首右上角）
  var sel=$("#lang-sel");
  if(sel){
    sel.value=LANG;
    sel.addEventListener("change",function(){
      if(LANGS.indexOf(sel.value)<0) return;
      LANG=sel.value; ls(LKEY,LANG);
      render();
    });
  }

  function chrome(){
    document.documentElement.lang=HTML_LANG[LANG];
    var title=tr(D.title);
    document.title=title+t("title_suffix");
    $("#site-title").textContent=title;
    var sub=$("#site-sub"), parts=t("header_sub",dayMonth(D.updated),dayMonth(D.next)).split(LANG==="zh"?"・":" · ");
    // 每段不斷行，換行只發生在段落之間
    sub.innerHTML=parts.map(function(x,i){return '<span class="nw">'+esc(x)+(i<parts.length-1?(LANG==="zh"?"・":" ·"):"")+'</span>';}).join(LANG==="zh"?"":" "); sub.title=t("header_tz");
    if(sel){ sel.value=LANG; sel.setAttribute("aria-label",t("lang_label")); }
    $("#lang-cur").textContent=SHORT[LANG];
    var ch=$("#cheer");
    if(ch) ch.innerHTML=esc(t("cheer","\u0000")).replace("\u0000",'<a href="'+TIP_URL+'" target="_blank" rel="noopener">'+esc(t("cheer_link"))+'</a>');
    var fab=$(".fab"); fab.title=t("fab_title"); fab.setAttribute("aria-label",t("fab_aria")); $(".fab-lbl").textContent=t("fab");
  }

  var sheetOpen=false;
  function tabsHtml(cls){
    return '<div class="'+cls+'" role="tablist" aria-label="'+esc(t("nav_aria"))+'">'+SECTIONS.map(function(c){
      var on=c.k===TAB;
      return '<button type="button" role="tab" class="tab" data-tab="'+c.k+'" aria-selected="'+on+'" tabindex="'+(on?0:-1)+'"><span>'+esc(t(c.nav))+'</span><span class="n num">'+c.items.length+'</span></button>';
    }).join("")+'</div>';
  }
  function optHtml(group,value,label){
    return '<label class="opt"><input type="checkbox" data-f="'+group+'" value="'+esc(value)+'"><span>'+esc(label)+'</span></label>';
  }
  // 側欄（桌機）／底部面板（手機）：分類、排序、篩選、商品挑選
  function sideHtml(sec){
    var F=facets(sec), s=[];
    s.push('<aside class="side" id="side" aria-label="'+esc(t("filters_aria"))+'"><div class="sheet-head"><b>'+esc(t("f_btn"))+'</b><button type="button" class="sheet-x" data-close aria-label="'+esc(t("close"))+'">✕</button></div><div class="side-body">');
    if(SECTIONS.length>1) s.push('<div class="blk blk-cats"><h3>'+esc(t("nav_aria"))+'</h3>'+tabsHtml("vtabs")+'</div>');
    s.push('<div class="blk" role="radiogroup" aria-label="'+esc(t("sort_label"))+'"><h3>'+esc(t("sort_label"))+'</h3>'+SORTS.map(function(k){
      return '<label class="opt"><input type="radio" name="sort" value="'+k+'"><span>'+esc(t("sort_"+k))+'</span></label>';}).join("")+'</div>');
    if(F.deal) s.push('<div class="blk">'+optHtml("deal","1",t("f_deal"))+'</div>');
    if(F.brand.length) s.push('<div class="blk"><h3>'+esc(t("f_brand"))+'</h3>'+F.brand.map(function(b){return optHtml("brand",b,b);}).join("")+'</div>');
    if(F.age.length) s.push('<div class="blk"><h3>'+esc(t("f_age"))+'</h3>'+F.age.map(function(a){return optHtml("age",a,t("age_"+a));}).join("")+'</div>');
    s.push('<div class="blk picker"><div class="pk-head"><h3>'+esc(t("focus_h"))+'</h3><span class="focus-count num" id="focus-count"></span><button type="button" class="focus-all" id="focus-all">'+esc(t("show_all"))+'</button></div>');
    sec.items.forEach(function(p){
      var img=p.image?esc(p.image):PLACEHOLDER;
      s.push('<label class="pk"><input type="checkbox" data-pick="'+esc(p.id)+'"><img src="'+img+'" alt="" width="22" height="22" decoding="async"><span>'+esc(p.chip||p.brand||tr(p.name))+'</span></label>');
    });
    s.push('</div><button type="button" class="clear-f" data-clear>'+esc(t("f_clear"))+'</button></div>');
    s.push('<div class="sheet-foot"><button type="button" class="ghost" data-clear>'+esc(t("f_clear"))+'</button><button type="button" class="solid" data-close id="sheet-show"></button></div></aside>');
    s.push('<div class="sheet-bg" data-close></div>');
    return s.join("");
  }

  function render(){
    chrome();
    var sec=secOf(TAB), html=[];
    html.push('<div class="layout">'+sideHtml(sec)+'<div class="content">');
    // 手機：一列分類 + 「篩選」按鈕（打開底部面板）
    html.push('<div class="mbar">'+(SECTIONS.length>1?tabsHtml("mtabs"):'<div class="mtabs"></div>')+'</div>');
    html.push('<div class="res-head"><h2 class="section-title">'+esc(t(sec.title))+'</h2><span class="res-n num" id="res-n"></span>'+'<button type="button" class="fbtn" id="fbtn" aria-controls="side" aria-expanded="false"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 5h18v2H3zm4 6h10v2H7zm3 6h4v2h-4z"/></svg><span>'+esc(t("f_btn"))+'</span><b class="fbadge num" id="fbadge" hidden></b></button></div>');
    html.push('<div class="grid" id="grid">');
    sec.items.forEach(function(p,i){ html.push(card(p,i)); });
    html.push('</div>');
    html.push('<div class="empty-focus" id="empty-focus" hidden><span aria-hidden="true">🐾</span><p>'+t("empty_focus")+'</p><button type="button" class="focus-all solid" data-all>'+esc(t("show_all"))+'</button></div>');
    html.push('<div class="empty-focus" id="empty-filter" hidden><span aria-hidden="true">🔍</span><p>'+esc(t("empty_filter"))+'</p><button type="button" class="focus-all solid" data-clear>'+esc(t("f_clear"))+'</button></div>');
    if(D.promos.length){
      html.push('<h2 class="section-title">'+esc(t("promos_title"))+'</h2><div class="promos">');
      D.promos.forEach(function(x){ html.push('<div class="promo"><b>'+esc(x.shop)+'</b><span>'+esc(tr(x.text))+'</span></div>'); });
      html.push('</div>');
    }
    html.push(details());
    html.push(cashbackHtml());
    html.push('</div></div>');
    $("#app").innerHTML = html.join("");

    var links=[];
    if(D.feedback_url) links.push('<a class="fb-btn" href="'+esc(D.feedback_url)+'" target="_blank" rel="noopener">'+esc(t("feedback"))+'</a>');
    links.push('<a class="tip-link" href="'+TIP_URL+'" target="_blank" rel="noopener">'+esc(t("tip_link"))+'</a>');
    $("#foot").innerHTML = '<div class="foot-links">'+links.join("")+'</div><p>'+esc(t("foot1"))+'</p><p>'+esc(t("foot2",D.generated_zh))+'</p>';

    var app=$("#app");
    app.querySelectorAll("[data-tab]").forEach(function(b){
      b.addEventListener("click",function(){ setTab(b.getAttribute("data-tab"), b.closest(".vtabs")?".vtabs":".mtabs"); });
      b.addEventListener("keydown",function(e){
        if(e.key!=="ArrowRight"&&e.key!=="ArrowLeft"&&e.key!=="ArrowDown"&&e.key!=="ArrowUp") return;
        e.preventDefault(); var ks=SECTIONS.map(function(c){return c.k;}), i=ks.indexOf(TAB), d=(e.key==="ArrowRight"||e.key==="ArrowDown")?1:-1;
        setTab(ks[(i+d+ks.length)%ks.length], b.closest(".vtabs")?".vtabs":".mtabs");
      });
    });
    app.querySelectorAll("[data-pick]").forEach(function(c){
      c.addEventListener("change",function(){
        var id=c.getAttribute("data-pick"), i=hidden.indexOf(id);
        if(c.checked&&i>=0) hidden.splice(i,1); else if(!c.checked&&i<0) hidden.push(id);
        saveHidden(); applyView();
      });
    });
    app.querySelectorAll("#focus-all,[data-all]").forEach(function(b){
      b.addEventListener("click",function(){ hidden=hidden.filter(function(id){return !sec.items.some(function(p){return p.id===id;});}); saveHidden(); applyView(); });
    });
    app.querySelectorAll("[data-f]").forEach(function(c){
      c.addEventListener("change",function(){
        var g=c.getAttribute("data-f"), f=filt();
        if(g==="deal") f.deal=c.checked;
        else { var a=f[g], i=a.indexOf(c.value); if(c.checked&&i<0) a.push(c.value); else if(!c.checked&&i>=0) a.splice(i,1); }
        saveView(); applyView();
      });
    });
    app.querySelectorAll('input[name="sort"]').forEach(function(r){
      r.addEventListener("change",function(){ if(r.checked){ VIEW.sort=r.value; saveView(); applyView(); } });
    });
    app.querySelectorAll("[data-clear]").forEach(function(b){
      b.addEventListener("click",function(){ VIEW.f[TAB]={brand:[],age:[],deal:false}; saveView(); applyView(); });
    });
    $("#fbtn").addEventListener("click",function(){ setSheet(true); });
    app.querySelectorAll("[data-close]").forEach(function(b){ b.addEventListener("click",function(){ setSheet(false); }); });
    applyView();
    setSheet(sheetOpen,true);
    document.querySelectorAll(".toggle").forEach(function(b){
      b.addEventListener("click",function(){
        var c=b.closest(".card"); var open=c.classList.toggle("open");
        b.setAttribute("aria-expanded",open?"true":"false");
      });
    });
    document.querySelectorAll(".more").forEach(function(b){
      b.addEventListener("click",function(){
        var list=b.previousElementSibling; var showing=list.classList.toggle("all");
        list.querySelectorAll(".offer.dim").forEach(function(li){li.hidden=!showing;});
        b.textContent = showing ? t("less") : b.getAttribute("data-label");
      });
    });
  }

  function setTab(k,from){
    if(!k||k===TAB) return;
    TAB=secOf(k).k; ls(TKEY,TAB); render();
    var b=document.querySelector((from||".mtabs")+' [data-tab="'+TAB+'"]'); if(b) b.focus({preventScroll:true});
    var bar=document.querySelector(".mtabs"); if(bar&&b&&from===".mtabs") b.scrollIntoView({block:"nearest",inline:"nearest"});
  }
  function setSheet(open,quiet){
    sheetOpen=!!open;
    document.body.classList.toggle("sheet-open",sheetOpen);
    var fb=$("#fbtn"); if(fb) fb.setAttribute("aria-expanded",sheetOpen?"true":"false");
    var side=$("#side");
    if(side){ if(sheetOpen){ side.setAttribute("role","dialog"); side.setAttribute("aria-modal","true"); } else { side.removeAttribute("role"); side.removeAttribute("aria-modal"); } }
    if(quiet) return;
    if(sheetOpen){ var x=side&&side.querySelector(".sheet-x"); if(x) x.focus({preventScroll:true}); } else if(fb) fb.focus({preventScroll:true});
  }
  document.addEventListener("keydown",function(e){ if(e.key==="Escape"&&sheetOpen) setSheet(false); });
  // 視窗變寬（改成側欄）時自動關閉底部面板
  if(window.matchMedia){ var mq=window.matchMedia("(min-width: 900px)"); var mqf=function(){ if(mq.matches&&sheetOpen) setSheet(false,true); }; if(mq.addEventListener) mq.addEventListener("change",mqf); else if(mq.addListener) mq.addListener(mqf); }

  // 套用分類、篩選、關注、排序（不重畫卡片，展開狀態保留）
  function applyView(){
    var sec=secOf(TAB), f=filt(), app=$("#app");
    app.classList.toggle("sort-drop",VIEW.sort==="drop");
    app.querySelectorAll("[data-pick]").forEach(function(c){ c.checked=hidden.indexOf(c.getAttribute("data-pick"))<0; });
    app.querySelectorAll("[data-f]").forEach(function(c){ var g=c.getAttribute("data-f"); c.checked = g==="deal" ? f.deal : f[g].indexOf(c.value)>=0; });
    app.querySelectorAll('input[name="sort"]').forEach(function(r){ r.checked=r.value===VIEW.sort; });
    var byId={}; D.products.forEach(function(p){ byId[p.id]=p; });
    var shown=0, unhidden=0;
    sec.items.forEach(function(p){ if(hidden.indexOf(p.id)<0){ unhidden++; if(pass(p,f)) shown++; } });
    app.querySelectorAll("[data-pid]").forEach(function(el){
      var p=byId[el.getAttribute("data-pid")];
      el.hidden=!(p&&catOf(p)===TAB&&hidden.indexOf(p.id)<0&&pass(p,f));
    });
    // 排序：依序把卡片重新放進格線
    var grid=$("#grid");
    sec.items.slice().sort(cmp).forEach(function(p){ var el=document.getElementById(p.id); if(el&&el.parentNode===grid) grid.appendChild(el); });
    var total=sec.items.length;
    $("#focus-count").textContent = unhidden===total ? "" : t("focus_count",unhidden,total);
    $("#focus-all").hidden = unhidden===total;
    $("#empty-focus").hidden = unhidden>0;
    $("#empty-filter").hidden = !(unhidden>0&&shown===0);
    $("#res-n").textContent = shown===total ? t("n_items",total) : t("n_items_of",shown,total);
    var na=nActive(f)+(unhidden<total?1:0), fb=$("#fbadge");
    fb.hidden=!na; fb.textContent=na||""; $("#fbtn").setAttribute("aria-label",t("f_btn")+(na?" ("+t("f_active",na)+")":""));
    app.querySelectorAll("[data-clear]").forEach(function(b){ if(b.classList.contains("clear-f")) b.hidden=!nActive(f); else if(!b.classList.contains("solid")) b.disabled=!nActive(f); });
    $("#sheet-show").textContent=t("show_n",shown);
  }

  // 標籤：同類型同顏色（ship 運費、sub 訂閱、cond 其他條件、cash 返現、deal 新客首單、once 單次購買）
  function tagsHtml(o,p,noOnce){
    var u=unitW(p), tg=(o.tags||[]).map(function(x){return {k:x.k,p:x.p,t:tr(x.t)};});
    if(o.new_customer) tg.push({k:"deal",t:t("new_cust",(pbv(o.new_customer)!=null?eur(pbv(o.new_customer),bd(p))+'/'+bu(p):eur(o.new_customer.unit)+'/'+u))});
    var otp=o.one_time_pb!=null?o.one_time_pb:o.one_time_per100g;
    if(o.one_time_unit&&!noOnce) tg.push({k:"once",t:t("once",(otp!=null?eur(otp,bd(p))+'/'+bu(p):eur(o.one_time_unit)+'/'+u))});
    return tg.map(function(x){
      var inv=x.k==="cash"&&x.p?INVITE[x.p]:null;
      if(inv) return '<a class="tag t-'+esc(x.k)+' tag-link" href="'+esc(inv)+'" target="_blank" rel="noopener sponsored" title="'+esc(t("invite_title",x.p))+'">'+esc(x.t)+' ›</a>';
      return '<span class="tag t-'+esc(x.k)+'">'+esc(x.t)+'</span>';
    }).join("");
  }

  // 返現網站註冊區：build.py 只會輸出今日資料實際用到、且有設定邀請連結的網站
  function cashbackHtml(){
    if(!INVITES.length) return "";
    return '<section class="cb" aria-labelledby="cb-h"><h2 id="cb-h">'+esc(t("cb_title"))+'</h2>'+
      '<p>'+esc(t("cb_desc"))+'</p><div class="cb-list">'+
      INVITES.map(function(x){return '<div class="cb-item"><a class="cb-btn" href="'+esc(x.url)+'" target="_blank" rel="noopener sponsored" aria-label="'+esc(t("cb_aria",x.name))+'"><b>'+esc(x.name)+'</b><span>'+esc(t("cb_btn"))+'</span></a>'+(x.note?'<small class="cb-note">'+esc(tr(x.note))+'</small>':'')+'</div>';}).join("")+
      '</div></section>';
  }

  // 價格水準膠囊（類似 Google 機票「目前價格偏低」）：依該商品自己的每日最低價歷史
  function levelHtml(p){
    var L=p.level; if(!L) return "";
    if(L.status!=="ok") return '<div class="level collecting"><span class="lv-h">'+esc(t("lv_h"))+'</span>'+esc(t("lv_collecting",L.n,L.need))+'</div>';
    // 三段等寬：最低–25%、25–75%、75%–最高；標記在所屬區段內線性定位
    function seg(v,a,b){return b>a?Math.min(1,Math.max(0,(v-a)/(b-a))):0.5;}
    var c=L.cur, pos = c<=L.p25 ? seg(c,L.min,L.p25)/3 : (c>=L.p75 ? (2+seg(c,L.p75,L.max))/3 : (1+seg(c,L.p25,L.p75))/3);
    pos=Math.min(0.97,Math.max(0.03,pos));
    var d=bd(p), un='/'+bu(p), lv=t("lv_"+L.level);
    return '<div class="level lv-'+esc(L.level)+'"><div class="lv-top"><span class="lv-h">'+esc(t("lv_now"))+'</span><b class="lv-tag">'+esc(lv)+'</b><span class="lv-n">'+esc(t("lv_n",L.n))+'</span></div>'+
      '<div class="lv-bar" role="img" aria-label="'+esc(t("lv_aria",eur(c,d)+un,lv,eur(L.p25,d),eur(L.p75,d)))+'"><span class="s1"></span><span class="s2"></span><span class="s3"></span><i style="left:'+(pos*100).toFixed(1)+'%"></i></div>'+
      '<div class="lv-scale num"><span>'+esc(t("lv_scale_low",eur(L.p25,d)))+'</span><span>'+esc(t("lv_typical"))+'</span><span>'+esc(t("lv_scale_high",eur(L.p75,d)))+'</span></div></div>';
  }

  function card(p,i){
    var b=p.best, u=unitW(p), name=tr(p.name);
    var img = p.image ? esc(p.image) : PLACEHOLDER;
    var s = '<article class="card" id="'+esc(p.id)+'" data-pid="'+esc(p.id)+'">';
    s += '<div class="card-main">';
    s += '<div class="thumb"><img src="'+img+'" alt="'+esc(t("img_alt",p.brand+" "+name))+'" width="112" height="112" '+(i>1?'loading="lazy" ':'')+'decoding="async"></div>';
    s += '<div class="ptitle"><div class="brandname">'+esc(p.brand)+'</div><h3>'+esc(name)+'</h3><div class="desc">'+esc(tr(p.desc))+(p.pack?DOT()+esc(tr(p.pack)):'')+'</div>';
    var dropb = p.drop>0 ? '<span class="badge dropb">'+esc(t("drop_badge",Math.round(p.drop)))+'</span>' : '';
    if(p.badge||dropb) s += '<div class="badges">'+(p.badge?'<span class="badge '+esc(p.badge.kind)+'">'+esc(tr(p.badge.text))+'</span>':'')+dropb+'</div>';
    s += '</div>';
    if(!b){
      s += '<div class="where">'+esc(t("no_offer"))+'</div></div>';
    } else {
      s += '<div class="deal"><div class="price">'+(pbv(b)!=null
        ? '<div class="lbl">'+esc(t("lowest_per_base",bz(p)))+'</div><div class="val num">'+eur(pbv(b),bd(p))+'<small>/'+bu(p)+'</small></div><div class="per num">'+eur(b.unit)+'/'+esc(u)+(b.size?PAR(esc(sz(p,b.size))):'')+'</div>'
        : '<div class="lbl">'+esc(t("lowest_per_unit",u))+'</div><div class="val num">'+eur(b.unit)+'<small>/'+esc(u)+'</small></div>')+'</div>';
      s += '<a class="buy" href="'+esc(b.url)+'" target="_blank" rel="noopener nofollow">'+esc(t("go_to",tr(b.shop)))+' '+ARROW+'</a></div>';
      s += '<div class="where"><b>'+esc(tr(b.shop))+'</b>'+DOT()+variant(b.variant)+DOT()+esc(tr(b.basis))+' <span class="num">'+eur(b.price)+'</span><div class="c">'+tagsHtml(b,p,!!p.one_time_best)+'</div></div>';
      s += levelHtml(p);
      if(p.one_time_best){
        var o=p.one_time_best;
        s += '<div class="alt">'+esc(t("alt_once"))+(LANG==="zh"?"":" ")+'<a href="'+esc(o.url)+'" target="_blank" rel="noopener nofollow">'+esc(tr(o.shop))+'</a> '+variant(o.variant)+' '+(pbv(o)!=null?pB(p,pbv(o)):'<span class="num">'+eur(o.unit)+'</span>/'+esc(u))+'</div>';
      }
      s += '</div>';
    }
    var others = p.offers.filter(function(o){return !(o.in_stock&&o.verified);}).length;
    s += '<button class="toggle" type="button" aria-expanded="false">'+esc(t("compare",p.shop_count))+CHEV+'</button>';
    s += '<div class="drill">'+chart(p)+'<h4>'+esc(t("rank_h",bz(p)))+'</h4><ol class="offers">';
    var groups=[], byShop={};
    p.offers.forEach(function(o){
      var main=o.in_stock&&o.verified;
      if(!main){ groups.push({main:false,items:[o]}); return; }
      if(!byShop[o.shop]){ byShop[o.shop]={main:true,items:[]}; groups.push(byShop[o.shop]); }
      byShop[o.shop].items.push(o);
    });
    groups.sort(function(a,b){return (a.main===b.main)?0:(a.main?-1:1);});
    var rank=0;
    groups.forEach(function(g){
      var o=g.items[0], main=g.main;
      if(main) rank++;
      var tags = tagsHtml(o,p);
      var st = !o.in_stock ? t("st_oos") : (o.status==="partly_verified" ? t("st_partly") : (o.verified ? "" : t("st_unver")));
      var rest = g.items.slice(1).map(function(x){return variant(x.variant)+' '+(pbv(x)!=null?'<b class="num">'+eur(pbv(x),bd(p))+'</b>/'+bu(p):eur(x.unit)+'/'+esc(u));}).join(LSEP());
      var bigv = pbv(o)!=null ? eur(pbv(o),bd(p))+'<span class="h">/'+bu(p)+'</span>' : eur(o.unit)+'<span class="h">/'+esc(u)+'</span>';
      var smallv = pbv(o)!=null ? eur(o.unit)+'/'+esc(u)+(o.size?PAR(esc(sz(p,o.size))):'') : '';
      s += '<li class="offer'+(main?'':' dim')+(main&&rank===1?' top':'')+'"'+(main?'':' hidden')+'>'+
        '<span class="rank">'+(main?rank:'–')+'</span>'+
        '<div class="o-name"><div class="s">'+esc(tr(o.shop))+(st?' <span class="st">'+esc(st)+'</span>':'')+'</div>'+
        '<div class="v">'+variant(o.variant)+DOT()+esc(tr(o.basis))+' <span class="num">'+eur(o.price)+'</span></div>'+
        '<div class="c">'+tags+'</div>'+
        (rest?'<div class="r">'+esc(t("other_sizes"))+rest+'</div>':'')+'</div>'+
        '<div class="o-price"><div class="u num">'+bigv+'</div><div class="h num">'+smallv+'</div>'+
        '<a href="'+esc(o.url)+'" target="_blank" rel="noopener nofollow">'+esc(t("go"))+'</a></div></li>';
    });
    s += '</ol>';
    if(others>0){ var lbl=t("more",others); s += '<button class="more" type="button" data-label="'+esc(lbl)+'">'+esc(lbl)+'</button>'; }
    s += '</div></article>';
    return s;
  }

  function chart(p){
    var u=unitW(p), use100=p.history.every(function(x){return pbv(x)!=null;});
    var h=p.history.map(function(x){return {date:x.date, v:use100?pbv(x):x.unit};});
    var un=use100?bu(p):u, dd=use100?bd(p):2;
    var s='<div class="chart"><h4>'+esc(use100?t("trend_base",bz(p)):t("trend_unit",un))+'</h4>';
    if(h.length<2){
      var last=h[h.length-1];
      s+='<div class="empty">'+t("trend_one",last?esc(shortDate(last.date)):"",last?PAR('<b class="num">'+eur(last.v,dd)+'</b>/'+esc(un)):'')+'</div></div>';
      return s;
    }
    var W=340,H=130,L=40,R=10,T=12,B=22;
    var vals=h.map(function(x){return x.v;});
    var mn=Math.min.apply(null,vals), mx=Math.max.apply(null,vals);
    var pad=(mx-mn)*0.15||0.1; mn-=pad; mx+=pad;
    var x=function(i){return L+(W-L-R)*(h.length===1?0.5:i/(h.length-1));};
    var y=function(v){return T+(H-T-B)*(1-(v-mn)/(mx-mn));};
    var pts=h.map(function(d,i){return x(i).toFixed(1)+","+y(d.v).toFixed(1);});
    var g='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(t("trend_aria"))+'">';
    [mn+pad, (mn+mx)/2, mx-pad].forEach(function(v){
      g+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y(v).toFixed(1)+'" y2="'+y(v).toFixed(1)+'" stroke="#efe7df"/>';
      g+='<text x="'+(L-6)+'" y="'+(y(v)+4).toFixed(1)+'" font-size="10" text-anchor="end" fill="#8a807a">'+eur(v,dd)+'</text>';
    });
    g+='<polyline fill="none" stroke="#e8573a" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="'+pts.join(" ")+'"/>';
    h.forEach(function(d,i){ g+='<circle cx="'+x(i).toFixed(1)+'" cy="'+y(d.v).toFixed(1)+'" r="3.5" fill="#fff" stroke="#e8573a" stroke-width="2"><title>'+esc(dayMonth(d.date))+COL()+eur(d.v,dd)+'/'+esc(un)+'</title></circle>'; });
    var step=Math.max(1,Math.ceil(h.length/6));
    h.forEach(function(d,i){ if(i%step===0||i===h.length-1) g+='<text x="'+x(i).toFixed(1)+'" y="'+(H-6)+'" font-size="10" text-anchor="middle" fill="#8a807a">'+esc(shortDate(d.date))+'</text>'; });
    g+='</svg>';
    return s+g+'</div>';
  }

  function details(){
    var d=D.details, s='<details class="more-info"><summary>'+esc(t("details"))+'</summary><div class="body">';
    if(d.assumptions) s+='<h5>'+esc(t("d_calc"))+'</h5><p>'+esc(tr(d.assumptions))+'</p>';
    if(d.promos_other && d.promos_other.length){
      s+='<h5>'+esc(t("d_promos_other"))+'</h5><ul>'+d.promos_other.map(function(x){return '<li>'+esc(x.shop)+COL()+esc(tr(x.text))+'</li>';}).join("")+'</ul>';
    }
    var notes=[];
    D.products.forEach(function(p){ p.offers.forEach(function(o){ if(o.detail) notes.push('<li data-pid="'+esc(p.id)+'">'+esc(p.brand)+DOT()+esc(tr(o.shop))+' '+variant(o.variant)+COL()+esc(tr(o.detail))+'</li>'); }); });
    if(notes.length) s+='<h5>'+esc(t("d_notes"))+'</h5><ul>'+notes.join("")+'</ul>';
    if(d.unverified && d.unverified.length) s+='<h5>'+esc(t("d_unverified"))+'</h5><ul>'+d.unverified.map(function(x){return '<li>'+esc(tr(x))+'</li>';}).join("")+'</ul>';
    return s+'</div></details>';
  }

  render();
})();
