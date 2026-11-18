(function(){
  "use strict";
  var D = JSON.parse(document.getElementById("site-data").textContent);
  var $ = function(s){return document.querySelector(s);};
  function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function eur(v,d){ if(v==null||v==="") return "—"; return "€"+Number(v).toFixed(d==null?2:d); }
  function dayMonth(iso){ if(!iso) return ""; var p=iso.split("-"); return (+p[1])+"月"+(+p[2])+"日"; }
  function shortDate(iso){ if(!iso) return ""; var p=iso.split("-"); return (+p[1])+"/"+(+p[2]); }
  var ARROW='<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.2 5.3a1 1 0 0 1 1.4 0l6 6a1 1 0 0 1 0 1.4l-6 6a1 1 0 1 1-1.4-1.4l4.3-4.3H4a1 1 0 1 1 0-2h13.5l-4.3-4.3a1 1 0 0 1 0-1.4z"/></svg>';
  var CHEV='<svg class="chev" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.3 9.3a1 1 0 0 1 1.4 0L12 13.6l4.3-4.3a1 1 0 1 1 1.4 1.4l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 0 1 0-1.4z"/></svg>';
  var PLACEHOLDER="data:image/svg+xml,"+encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='#e9f2f8'/><text x='50' y='64' font-size='38' text-anchor='middle'>🌀</text></svg>");

  // 返現邀請連結（build.py 只輸出目前資料實際用到的網站）
  var INVITES = D.cashback_invites||[], INVITE={};
  INVITES.forEach(function(x){ INVITE[x.name]=x.url; });

  function ls(k,v){ try{ if(v===undefined) return localStorage.getItem(k); if(v===null) localStorage.removeItem(k); else localStorage.setItem(k,v); }catch(e){} return null; }

  // 關注篩選：儲存「隱藏的商品」，之後新增的商品預設顯示，已移除的 id 自動忽略
  var FKEY="pricetracker.hidden.v1";
  var IDS=D.products.map(function(p){return p.id;});
  var hidden=loadHidden();
  function loadHidden(){
    try{ var v=JSON.parse(ls(FKEY)||"[]"); return Array.isArray(v)?v.filter(function(id){return IDS.indexOf(id)>=0;}):[]; }
    catch(e){ return []; }
  }
  function saveHidden(){ ls(FKEY, hidden.length?JSON.stringify(hidden):null); }

  // 篩選與排序（pricetracker.view.v1：{sort, f:{brand:[], hasbest}})
  var VKEY="pricetracker.view.v1", SORTS=["cheap","drop","recent"];
  var VIEW=(function(){ try{ var v=JSON.parse(ls(VKEY)||"{}"); if(v&&typeof v==="object") return {sort:SORTS.indexOf(v.sort)>=0?v.sort:"cheap", f:(v.f&&typeof v.f==="object")?v.f:{}}; }catch(e){} return {sort:"cheap",f:{}}; })();
  function saveView(){ ls(VKEY, JSON.stringify(VIEW)); }
  function facets(){
    var brands=[];
    D.products.forEach(function(p){ if(p.brand&&brands.indexOf(p.brand)<0) brands.push(p.brand); });
    var deals={}; D.products.forEach(function(p){ deals[!!p.best]=1; });
    return {brand:brands.length>1?brands:[], hasbest:!!(deals["true"]&&deals["false"])};
  }
  function filt(){
    var F=facets(), f=VIEW.f||{};
    var r={brand:(f.brand||[]).filter(function(b){return F.brand.indexOf(b)>=0;}), hasbest:F.hasbest&&!!f.hasbest};
    VIEW.f=r; return r;
  }
  function nActive(f){ return f.brand.length+(f.hasbest?1:0); }
  function pass(p,f){
    if(f.brand.length&&f.brand.indexOf(p.brand)<0) return false;
    if(f.hasbest&&!p.best) return false;
    return true;
  }
  function bestNet(p){ return p.best?p.best.net:Infinity; }
  function cmp(a,b){
    var s=VIEW.sort, d=0;
    if(s==="drop") d=(b.drop||0)-(a.drop||0);
    else if(s==="recent") d=(b.date||"")<(a.date||"")?-1:((b.date||"")>(a.date||"")?1:0);
    return d||(bestNet(a)-bestNet(b))||(D.products.indexOf(a)-D.products.indexOf(b));
  }

  function chrome(){
    document.title=D.title+"｜每天更新";
    $("#site-title").textContent=D.title;
    $("#site-sub").textContent=(D.site_sub||"空氣清淨機・寄送鹿特丹・每天更新");
    var u=$("#site-updated");
    if(u) u.innerHTML="最後更新<b>"+esc(D.updated_zh)+"</b>";
  }

  var sheetOpen=false;
  function optHtml(group,value,label){
    return '<label class="opt"><input type="checkbox" data-f="'+group+'" value="'+esc(value)+'"><span>'+esc(label)+'</span></label>';
  }
  // 側欄（桌機）／底部面板（手機）：排序、篩選、商品挑選
  function sideHtml(){
    var F=facets(), s=[];
    s.push('<aside class="side" id="side" aria-label="篩選"><div class="sheet-head"><b>篩選</b><button type="button" class="sheet-x" data-close aria-label="關閉">✕</button></div><div class="side-body">');
    s.push('<div class="blk" role="radiogroup" aria-label="排序"><h3>排序</h3>'+[["cheap","最低價優先"],["drop","降價最多"],["recent","最近更新"]].map(function(kv){
      return '<label class="opt"><input type="radio" name="sort" value="'+kv[0]+'"><span>'+kv[1]+'</span></label>';}).join("")+'</div>');
    if(F.hasbest) s.push('<div class="blk">'+optHtml("hasbest","1","只看有已核實可買價")+'</div>');
    if(F.brand.length) s.push('<div class="blk"><h3>品牌</h3>'+F.brand.map(function(b){return optHtml("brand",b,b);}).join("")+'</div>');
    s.push('<div class="blk picker"><div class="pk-head"><h3>關注商品</h3><span class="focus-count num" id="focus-count"></span><button type="button" class="focus-all" id="focus-all">全部顯示</button></div>');
    D.products.forEach(function(p){
      var img=p.image?esc(p.image):PLACEHOLDER;
      s.push('<label class="pk"><input type="checkbox" data-pick="'+esc(p.id)+'"><img src="'+img+'" alt="" width="22" height="22" decoding="async"><span>'+esc(p.brand+" "+p.name)+'</span></label>');
    });
    s.push('</div><button type="button" class="clear-f" data-clear>清除篩選</button></div>');
    s.push('<div class="sheet-foot"><button type="button" class="ghost" data-clear>清除篩選</button><button type="button" class="solid" data-close id="sheet-show"></button></div></aside>');
    s.push('<div class="sheet-bg" data-close></div>');
    return s.join("");
  }

  function render(){
    chrome();
    var html=[];
    html.push('<div class="layout">'+sideHtml()+'<div class="content">');
    html.push('<div class="mbar"><button type="button" class="fbtn" id="fbtn" aria-controls="side" aria-expanded="false"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 5h18v2H3zm4 6h10v2H7zm3 6h4v2h-4z"/></svg><span>篩選</span><b class="fbadge num" id="fbadge" hidden></b></button></div>');
    html.push('<div class="res-head"><h2 class="section-title">空氣清淨機比價</h2><span class="res-n num" id="res-n"></span></div>');
    html.push('<div class="grid" id="grid">');
    D.products.forEach(function(p,i){ html.push(card(p,i)); });
    html.push('</div>');
    html.push('<div class="empty-focus" id="empty-focus" hidden><span aria-hidden="true">🌀</span><p>你把商品都取消關注了。</p><button type="button" class="focus-all solid" data-all>全部顯示</button></div>');
    html.push('<div class="empty-focus" id="empty-filter" hidden><span aria-hidden="true">🔍</span><p>沒有符合篩選的商品。</p><button type="button" class="focus-all solid" data-clear>清除篩選</button></div>');
    html.push(details());
    html.push(cashbackHtml());
    html.push('</div></div>');
    $("#app").innerHTML = html.join("");
    $("#foot").innerHTML = '<p>價格單位 EUR。未核實價格已標示，不可當現價；最佳價只計已核實、有貨可訂且可寄荷蘭的通路。只讀查價，不代下單。</p><p>產生時間：'+esc(D.generated_zh)+'（Europe/Amsterdam）・下次更新：'+esc(D.next_zh)+'</p>';

    var app=$("#app");
    app.querySelectorAll("[data-pick]").forEach(function(c){
      c.addEventListener("change",function(){
        var id=c.getAttribute("data-pick"), i=hidden.indexOf(id);
        if(c.checked&&i>=0) hidden.splice(i,1); else if(!c.checked&&i<0) hidden.push(id);
        saveHidden(); applyView();
      });
    });
    app.querySelectorAll("#focus-all,[data-all]").forEach(function(b){
      b.addEventListener("click",function(){ hidden=[]; saveHidden(); applyView(); });
    });
    app.querySelectorAll("[data-f]").forEach(function(c){
      c.addEventListener("change",function(){
        var g=c.getAttribute("data-f"), f=filt();
        if(g==="hasbest") f.hasbest=c.checked;
        else { var a=f[g], i=a.indexOf(c.value); if(c.checked&&i<0) a.push(c.value); else if(!c.checked&&i>=0) a.splice(i,1); }
        saveView(); applyView();
      });
    });
    app.querySelectorAll('input[name="sort"]').forEach(function(r){
      r.addEventListener("change",function(){ if(r.checked){ VIEW.sort=r.value; saveView(); applyView(); } });
    });
    app.querySelectorAll("[data-clear]").forEach(function(b){
      b.addEventListener("click",function(){ VIEW.f={brand:[],hasbest:false}; saveView(); applyView(); });
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
        b.textContent = showing ? "收起" : b.getAttribute("data-label");
      });
    });
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
  if(window.matchMedia){ var mq=window.matchMedia("(min-width: 900px)"); var mqf=function(){ if(mq.matches&&sheetOpen) setSheet(false,true); }; if(mq.addEventListener) mq.addEventListener("change",mqf); else if(mq.addListener) mq.addListener(mqf); }

  // 套用篩選、關注、排序（不重畫卡片，展開狀態保留）
  function applyView(){
    var f=filt(), app=$("#app");
    app.classList.toggle("sort-drop",VIEW.sort==="drop");
    app.querySelectorAll("[data-pick]").forEach(function(c){ c.checked=hidden.indexOf(c.getAttribute("data-pick"))<0; });
    app.querySelectorAll("[data-f]").forEach(function(c){ var g=c.getAttribute("data-f"); c.checked = g==="hasbest" ? f.hasbest : f[g].indexOf(c.value)>=0; });
    app.querySelectorAll('input[name="sort"]').forEach(function(r){ r.checked=r.value===VIEW.sort; });
    var byId={}; D.products.forEach(function(p){ byId[p.id]=p; });
    var shown=0, unhidden=0;
    D.products.forEach(function(p){ if(hidden.indexOf(p.id)<0){ unhidden++; if(pass(p,f)) shown++; } });
    app.querySelectorAll("[data-pid]").forEach(function(el){
      var p=byId[el.getAttribute("data-pid")];
      el.hidden=!(p&&hidden.indexOf(p.id)<0&&pass(p,f));
    });
    var grid=$("#grid");
    D.products.slice().sort(cmp).forEach(function(p){ var el=document.getElementById(p.id); if(el&&el.parentNode===grid) grid.appendChild(el); });
    var total=D.products.length;
    $("#focus-count").textContent = unhidden===total ? "" : unhidden+"／"+total;
    $("#focus-all").hidden = unhidden===total;
    $("#empty-focus").hidden = unhidden>0;
    $("#empty-filter").hidden = !(unhidden>0&&shown===0);
    $("#res-n").textContent = shown===total ? "共 "+total+" 款" : shown+"／"+total+" 款";
    var na=nActive(f)+(unhidden<total?1:0), fb=$("#fbadge");
    fb.hidden=!na; fb.textContent=na||""; $("#fbtn").setAttribute("aria-label","篩選"+(na?"（"+na+" 項使用中）":""));
    app.querySelectorAll("[data-clear]").forEach(function(b){ if(b.classList.contains("clear-f")) b.hidden=!nActive(f); else if(!b.classList.contains("solid")) b.disabled=!nActive(f); });
    $("#sheet-show").textContent="顯示 "+shown+" 款";
  }

  // 標籤：同類型同顏色（ship 運費、cond 門檻、cash 返現、deal 促銷）
  function tagsHtml(o){
    return (o.tags||[]).map(function(x){
      var inv=x.k==="cash"&&x.p?INVITE[x.p]:null;
      if(inv) return '<a class="tag t-'+esc(x.k)+' tag-link" href="'+esc(inv)+'" target="_blank" rel="noopener sponsored" title="經 '+esc(x.p)+' 註冊">'+esc(x.t)+' ›</a>';
      return '<span class="tag t-'+esc(x.k)+'">'+esc(x.t)+'</span>';
    }).join("");
  }

  // 返現網站註冊區：build.py 只會輸出目前資料實際用到、且有設定邀請連結的網站
  function cashbackHtml(){
    if(!INVITES.length) return "";
    return '<section class="cb" aria-labelledby="cb-h"><h2 id="cb-h">先註冊返現網站，下單再拿回一點錢</h2>'+
      '<p>經返現網站連到商店下單，完成後可拿回部分金額（各站規則與等待時間不同）。</p><div class="cb-list">'+
      INVITES.map(function(x){return '<div class="cb-item"><a class="cb-btn" href="'+esc(x.url)+'" target="_blank" rel="noopener sponsored" aria-label="前往 '+esc(x.name)+' 註冊"><b>'+esc(x.name)+'</b><span>註冊 ›</span></a>'+(x.note?'<small class="cb-note">'+esc(x.note)+'</small>':'')+'</div>';}).join("")+
      '</div></section>';
  }

  // 價格水準膠囊：依該商品自己的每日最低可買價歷史
  function levelHtml(p){
    var L=p.level; if(!L) return "";
    if(L.status!=="ok") return '<div class="level collecting"><span class="lv-h">價格水準</span>資料累積中（已有 '+L.n+' 天，需 '+L.need+' 天）</div>';
    function seg(v,a,b){return b>a?Math.min(1,Math.max(0,(v-a)/(b-a))):0.5;}
    var c=L.cur, pos = L.level==="low" ? seg(c,L.min,L.p25)/3 : (L.level==="high" ? (2+seg(c,L.p75,L.max))/3 : (1+seg(c,L.p25,L.p75))/3);
    pos=Math.min(0.97,Math.max(0.03,pos));
    var lv={low:"偏低",typical:"一般",high:"偏高"}[L.level]||L.level;
    return '<div class="level lv-'+esc(L.level)+'"><div class="lv-top"><span class="lv-h">目前價格</span><b class="lv-tag">'+esc(lv)+'</b><span class="lv-n">近 '+L.n+' 天</span></div>'+
      '<div class="lv-bar" role="img" aria-label="目前 '+eur(c)+'，'+lv+'；近 '+L.n+' 天 25% 價位 '+eur(L.p25)+'、75% 價位 '+eur(L.p75)+'"><span class="s1"></span><span class="s2"></span><span class="s3"></span><i style="left:'+(pos*100).toFixed(1)+'%"></i></div>'+
      '<div class="lv-scale num"><span>偏低 ≤ '+eur(L.p25)+'</span><span>一般</span><span>偏高 ≥ '+eur(L.p75)+'</span></div></div>';
  }

  function offerName(o){
    var n=esc(o.shop);
    if(o.url) n='<a href="'+esc(o.url)+'" target="_blank" rel="noopener nofollow">'+n+'</a>';
    return n;
  }

  function card(p,i){
    var b=p.best;
    var img = p.image ? esc(p.image) : PLACEHOLDER;
    var s = '<article class="card" id="'+esc(p.id)+'" data-pid="'+esc(p.id)+'">';
    s += '<div class="card-main">';
    s += '<div class="thumb"><img src="'+img+'" alt="'+esc(p.brand+" "+p.name)+'" width="112" height="112" '+(i>1?'loading="lazy" ':'')+'decoding="async"></div>';
    s += '<div class="ptitle"><div class="brandname">'+esc(p.brand)+'</div><h3>'+esc(p.name)+'</h3><div class="desc">'+esc(p.desc)+'</div>';
    var dropb = p.drop>0 ? '<span class="badge dropb">近 30 天降 '+Math.round(p.drop)+'%</span>' : '';
    if(p.badge||dropb) s += '<div class="badges">'+(p.badge?'<span class="badge '+esc(p.badge.kind)+'">'+esc(p.badge.text)+'</span>':'')+dropb+'</div>';
    s += '</div>';
    if(!b){
      s += '<div class="where">目前沒有已核實、可買且可寄荷蘭的報價（最後查價 '+esc(dayMonth(p.date))+'）。</div></div>';
    } else {
      s += '<div class="deal"><div class="price"><div class="lbl">目前最低淨總價（已核實可買）</div><div class="val num">'+eur(b.net)+'</div><div class="per num">商品 '+eur(b.price)+'・'+esc(b.shipping_label||"")+'</div></div>';
      s += '<a class="buy" href="'+esc(b.url||"#")+'" target="_blank" rel="noopener nofollow">前往 '+esc(b.shop)+' '+ARROW+'</a></div>';
      s += '<div class="where"><b>'+esc(b.shop)+'</b>'+(b.seller?'・'+esc(b.seller):'')+'・'+esc(b.variant)+' <span class="num">'+eur(b.net)+'</span><div class="c">'+tagsHtml(b)+'</div></div>';
      s += levelHtml(p);
      s += '</div>';
    }
    var others = p.offers.filter(function(o){return !o.purchasable||o.carried;}).length;
    s += '<button class="toggle" type="button" aria-expanded="false">比較 '+p.shop_count+' 家可買報價・全部 '+p.record_count+' 筆紀錄'+CHEV+'</button>';
    s += '<div class="drill">'+chart(p)+'<h4>報價排名（淨總價，僅已核實可買）</h4><ol class="offers">';
    var rank=0;
    p.offers.forEach(function(o){
      var main=o.purchasable&&!o.carried;
      if(main) rank++;
      var st=o.status_text||"";
      if(o.carried && o.date){ st=(st?st+" · ":"")+"上次查價 "+shortDate(o.date); }
      s += '<li class="offer'+(main?'':' dim')+(main&&rank===1?' top':'')+'"'+(main?'':' hidden')+'>'+
        '<span class="rank">'+(main?rank:'–')+'</span>'+
        '<div class="o-name"><div class="s">'+offerName(o)+(st?' <span class="st">'+esc(st)+'</span>':'')+'</div>'+
        '<div class="v">'+(o.seller?esc(o.seller)+'・':'')+esc(o.variant)+'</div>'+
        '<div class="c">'+tagsHtml(o)+'</div>'+
        (o.note?'<div class="v">'+esc(o.note)+'</div>':'')+'</div>'+
        '<div class="o-price"><div class="u num">'+eur(o.net)+'</div><div class="h num">商品 '+eur(o.price)+'</div>'+
        (o.url?'<a href="'+esc(o.url)+'" target="_blank" rel="noopener nofollow">前往 ›</a>':'')+'</div></li>';
    });
    s += '</ol>';
    if(others>0){ var lbl="顯示其他 "+others+" 筆（缺貨／未核實／不寄荷蘭／舊紀錄）"; s += '<button class="more" type="button" data-label="'+esc(lbl)+'">'+esc(lbl)+'</button>'; }
    s += '<h4>全部查價紀錄（'+p.record_count+' 筆，日期為實際查價日）</h4>'+fullTable(p);
    s += '</div></article>';
    return s;
  }

  function fullTable(p){
    var s='<div class="tablewrap"><table class="full"><thead><tr><th>日期</th><th>平台</th><th>賣家</th><th>規格</th><th>價格</th><th>運費</th><th>淨總價</th><th>核實</th><th>備註</th></tr></thead><tbody>';
    p.rows.forEach(function(r){
      var plat=esc(r.shop);
      if(r.url) plat='<a href="'+esc(r.url)+'" target="_blank" rel="noopener nofollow">'+plat+'</a>';
      s+='<tr'+(r.verified?'':' class="unverified"')+'><td class="date">'+esc(r.date)+'</td><td>'+plat+'</td><td>'+esc(r.seller||"—")+'</td><td>'+esc(r.variant)+'</td>'+
        '<td class="num">'+eur(r.price)+'</td><td>'+esc(r.shipping||"—")+'</td><td class="num">'+eur(r.net)+'</td>'+
        '<td><span class="vbadge '+(r.verified?'ok">已核實':'no">未核實')+'</span>'+(r.verified_text&&r.verified_text!=="yes"&&r.verified_text!=="no"?'<br>'+esc(r.verified_text):'')+'</td>'+
        '<td>'+esc(r.note)+'</td></tr>';
    });
    return s+'</tbody></table></div>';
  }

  function chart(p){
    var h=p.history.map(function(x){return {date:x.date, v:x.net};}).filter(function(x){return x.v!=null;});
    var s='<div class="chart"><h4>每日最低可買淨價走勢</h4>';
    if(h.length<2){
      var last=h[h.length-1];
      s+='<div class="empty">'+(last?('只有 '+shortDate(last.date)+' 一天紀錄（<b class="num">'+eur(last.v)+'</b>），資料累積中。'):'尚無可買報價紀錄。')+'</div></div>';
      return s;
    }
    var W=340,H=130,L=52,R=10,T=12,B=22;
    var vals=h.map(function(x){return x.v;});
    var mn=Math.min.apply(null,vals), mx=Math.max.apply(null,vals);
    var pad=(mx-mn)*0.15||1; mn-=pad; mx+=pad;
    var x=function(i){return L+(W-L-R)*(h.length===1?0.5:i/(h.length-1));};
    var y=function(v){return T+(H-T-B)*(1-(v-mn)/(mx-mn));};
    var pts=h.map(function(d,i){return x(i).toFixed(1)+","+y(d.v).toFixed(1);});
    var g='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="價格走勢圖">';
    [mn+pad, (mn+mx)/2, mx-pad].forEach(function(v){
      g+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y(v).toFixed(1)+'" y2="'+y(v).toFixed(1)+'" stroke="#e2edf3"/>';
      g+='<text x="'+(L-6)+'" y="'+(y(v)+4).toFixed(1)+'" font-size="10" text-anchor="end" fill="#66727c">'+eur(v)+'</text>';
    });
    g+='<polyline fill="none" stroke="#0e7cc4" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="'+pts.join(" ")+'"/>';
    h.forEach(function(d,i){ g+='<circle cx="'+x(i).toFixed(1)+'" cy="'+y(d.v).toFixed(1)+'" r="3.5" fill="#fff" stroke="#0e7cc4" stroke-width="2"><title>'+esc(dayMonth(d.date))+'：'+eur(d.v)+'</title></circle>'; });
    var step=Math.max(1,Math.ceil(h.length/6));
    h.forEach(function(d,i){ if(i%step===0||i===h.length-1) g+='<text x="'+x(i).toFixed(1)+'" y="'+(H-6)+'" font-size="10" text-anchor="middle" fill="#66727c">'+esc(shortDate(d.date))+'</text>'; });
    g+='</svg>';
    return s+g+'</div>';
  }

  function details(){
    var d=D.details||{}, s='<details class="more-info"><summary>計算方式與未核實來源</summary><div class="body">';
    if(d.assumptions) s+='<h5>計算方式</h5><p>'+esc(d.assumptions)+'</p>';
    if(d.unverified && d.unverified.length){
      s+='<h5>未核實／無法採價的來源</h5><ul>'+d.unverified.map(function(x){return '<li>'+esc(x.product)+"・"+esc(x.site)+"："+esc(x.reason)+'</li>';}).join("")+'</ul>';
    }
    return s+'</div></details>';
  }

  render();
})();
