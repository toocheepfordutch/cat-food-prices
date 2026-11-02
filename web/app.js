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
  var BASE_LBL={"100g":"100g","g":"g","L":"L"}, BASE_KEY={"100g":"per_100g","g":"per_g","L":"per_L"};
  function bu(p){return BASE_LBL[p.base]||"100g";}
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

  // 關注篩選：儲存「隱藏的商品」，因此之後新增的商品預設會顯示，已下架的商品自動忽略
  var FKEY="catfood.hidden.v1";
  var IDS=D.products.map(function(p){return p.id;});
  var hidden=loadHidden();
  function loadHidden(){
    try{
      var v=JSON.parse(localStorage.getItem(FKEY)||"[]");
      return Array.isArray(v)?v.filter(function(id){return IDS.indexOf(id)>=0;}):[];
    }catch(e){return [];}
  }
  function saveHidden(){
    try{ if(hidden.length) localStorage.setItem(FKEY,JSON.stringify(hidden)); else localStorage.removeItem(FKEY); }catch(e){}
  }

  // 語言切換器（頁首右上角）
  var sel=$("#lang-sel");
  if(sel){
    sel.value=LANG;
    sel.addEventListener("change",function(){
      if(LANGS.indexOf(sel.value)<0) return;
      LANG=sel.value; try{ localStorage.setItem(LKEY,LANG); }catch(e){}
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

  function render(){
    chrome();
    var html = [];
    html.push('<section class="focus" aria-label="'+esc(t("focus_h"))+'"><div class="focus-head"><h2>'+esc(t("focus_h"))+'</h2><span class="focus-count num" id="focus-count"></span><button type="button" class="focus-all" id="focus-all">'+esc(t("show_all"))+'</button></div><div class="chips">');
    D.products.forEach(function(p){
      var img = p.image ? esc(p.image) : PLACEHOLDER;
      html.push('<button type="button" class="chip" data-pid="'+esc(p.id)+'" aria-pressed="true"><img src="'+img+'" alt="" width="24" height="24" decoding="async"><span>'+esc(p.brand||tr(p.name))+'</span><svg class="ck" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6 11-11-1.4-1.4z"/></svg></button>');
    });
    html.push('</div></section>');

    var FOOD=D.products.filter(function(p){return p.group!=="other";});
    var OTHER=D.products.filter(function(p){return p.group==="other";});
    html.push('<h2 class="section-title" data-group="food">'+esc(t("food_title"))+'</h2><div class="empty-focus" id="empty-focus" hidden><span aria-hidden="true">🐾</span><p>'+t("empty_focus")+'</p><button type="button" class="focus-all solid" data-all>'+esc(t("show_all"))+'</button></div><div class="grid">');
    FOOD.forEach(function(p,i){ html.push(card(p,i)); });
    html.push('</div>');
    if(OTHER.length){
      html.push('<h2 class="section-title" data-group="other">'+esc(t("other_title"))+'</h2><div class="grid">');
      OTHER.forEach(function(p,i){ html.push(card(p,FOOD.length+i)); });
      html.push('</div>');
    }
    if(D.promos.length){
      html.push('<h2 class="section-title">'+esc(t("promos_title"))+'</h2><div class="promos">');
      D.promos.forEach(function(x){ html.push('<div class="promo"><b>'+esc(x.shop)+'</b><span>'+esc(tr(x.text))+'</span></div>'); });
      html.push('</div>');
    }
    html.push(details());
    html.push(cashbackHtml());
    $("#app").innerHTML = html.join("");

    var links=[];
    if(D.feedback_url) links.push('<a class="fb-btn" href="'+esc(D.feedback_url)+'" target="_blank" rel="noopener">'+esc(t("feedback"))+'</a>');
    links.push('<a class="tip-link" href="'+TIP_URL+'" target="_blank" rel="noopener">'+esc(t("tip_link"))+'</a>');
    $("#foot").innerHTML = '<div class="foot-links">'+links.join("")+'</div><p>'+esc(t("foot1"))+'</p><p>'+esc(t("foot2",D.generated_zh))+'</p>';

    document.querySelectorAll(".chip").forEach(function(c){
      c.addEventListener("click",function(){
        var id=c.getAttribute("data-pid"), i=hidden.indexOf(id);
        if(i>=0) hidden.splice(i,1); else hidden.push(id);
        saveHidden(); applyFocus();
      });
    });
    document.querySelectorAll("#focus-all,[data-all]").forEach(function(b){
      b.addEventListener("click",function(){ hidden=[]; saveHidden(); applyFocus(); });
    });
    applyFocus();
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

  function applyFocus(){
    var shown=0;
    document.querySelectorAll(".chip").forEach(function(c){
      var on=hidden.indexOf(c.getAttribute("data-pid"))<0; c.setAttribute("aria-pressed",on?"true":"false");
    });
    document.querySelectorAll("[data-pid]:not(.chip)").forEach(function(el){
      var on=hidden.indexOf(el.getAttribute("data-pid"))<0; el.hidden=!on;
      if(on&&el.classList.contains("card")) shown++;
    });
    $("#focus-count").textContent = shown===IDS.length ? "" : t("focus_count",shown,IDS.length);
    $("#focus-all").hidden = shown===IDS.length;
    $("#empty-focus").hidden = shown>0;
    // 該分類的商品全部被隱藏時，連同分類標題一起隱藏
    document.querySelectorAll(".section-title[data-group]").forEach(function(el){
      var g=el.getAttribute("data-group"), any=D.products.some(function(p){return (p.group==="other"?"other":"food")===g && hidden.indexOf(p.id)<0;});
      el.hidden=!any && shown>0;
    });
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
    if(p.badge) s += '<div class="badges"><span class="badge '+esc(p.badge.kind)+'">'+esc(tr(p.badge.text))+'</span></div>';
    s += '</div>';
    if(!b){
      s += '<div class="where">'+esc(t("no_offer"))+'</div></div>';
    } else {
      s += '<div class="deal"><div class="price">'+(pbv(b)!=null
        ? '<div class="lbl">'+esc(t("lowest_per_base",bz(p)))+'</div><div class="val num">'+eur(pbv(b),bd(p))+'<small>/'+bu(p)+'</small></div><div class="per num">'+eur(b.unit)+'/'+esc(u)+(b.size?PAR(esc(b.size)):'')+'</div>'
        : '<div class="lbl">'+esc(t("lowest_per_unit",u))+'</div><div class="val num">'+eur(b.unit)+'<small>/'+esc(u)+'</small></div>')+'</div>';
      s += '<a class="buy" href="'+esc(b.url)+'" target="_blank" rel="noopener nofollow">'+esc(t("go_to",tr(b.shop)))+' '+ARROW+'</a></div>';
      s += '<div class="where"><b>'+esc(tr(b.shop))+'</b>'+DOT()+variant(b.variant)+DOT()+esc(tr(b.basis))+' <span class="num">'+eur(b.price)+'</span><div class="c">'+tagsHtml(b,p,!!p.one_time_best)+'</div></div>';
      s += levelHtml(p);
      if(p.one_time_best){
        var o=p.one_time_best;
        s += '<div class="alt">'+esc(t("alt_once"))+'<a href="'+esc(o.url)+'" target="_blank" rel="noopener nofollow">'+esc(tr(o.shop))+'</a> '+variant(o.variant)+' '+(pbv(o)!=null?pB(p,pbv(o)):'<span class="num">'+eur(o.unit)+'</span>/'+esc(u))+'</div>';
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
      var smallv = pbv(o)!=null ? eur(o.unit)+'/'+esc(u)+(o.size?PAR(esc(o.size)):'') : '';
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
