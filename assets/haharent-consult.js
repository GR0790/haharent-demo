/* ==========================================================================
   하하렌트 · 플로팅 상담 모달 (사고대차 / 일반렌트)
   --------------------------------------------------------------------------
   - 채널톡 기본 플로팅 버튼은 boot 시 hideChannelButtonOnBoot:true 로 숨기고,
     이 스크립트가 만든 "상담하기" 버튼 → 탭/페이지별 상담 양식 모달을 띄웁니다.
   - 연락처(휴대폰) 미입력·형식 오류, 개인정보 수집·이용 미동의 시 제출을 막습니다.
   - 제출하면 데스크톱/모바일 분기 요약 화면에서 전화·문자·채널톡으로 연결합니다.
   설정: 페이지에서 window.HAHA_CONSULT = { variant: "accident" | "rental" } 로 지정.
   ========================================================================== */
(function () {
  "use strict";

  var CFG = window.HAHA_CONSULT || {};
  var VARIANT = CFG.variant === "rental" ? "rental" : "accident";
  var PHONE = CFG.phone || "01020040790";
  var PHONE_DISPLAY = CFG.phoneDisplay || "010-2004-0790";

  var CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  var ERR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>';

  var BRANDS = [["hyundai", "현대"], ["kia", "기아"], ["genesis", "제네시스"], ["bmw", "BMW"], ["benz", "벤츠"], ["audi", "아우디"], ["tesla", "테슬라"], ["etc", "기타"]];
  var CCS = [["light", "경차", "~1,000cc"], ["compact", "소형", "~1,600cc"], ["midsize", "2.0급", "~2,500cc"], ["luxury", "3.0~4.0급", "~5,000cc"], ["ev", "전기차", "EV"]];
  var REGIONS = ["서울", "경기", "인천", "충청·대전·세종", "강원", "전라·광주", "경상·부산·대구"];
  var WHOS = ["개인", "법인·기업", "외국인"];
  var TERMS = [["일·단기", "일·단기", "하루~2주"], ["월렌트", "월렌트", "1개월~"], ["장기렌트", "장기렌트", "3개월~"]];

  var state = { brand: "", brandEtc: "", model: "", cc: "", region: "", who: "", term: "", memo: "", phone: "", agree: false };
  var els = {};
  var lastFocused = null;
  var toastTimer = null;
  var copyTimer = null;

  /* ---------------------------------------------------------------- utils */
  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function formatPhone(raw) {
    var d = String(raw || "").replace(/\D/g, "").slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return d.slice(0, 3) + "-" + d.slice(3);
    if (d.length <= 10) return d.slice(0, 3) + "-" + d.slice(3, 6) + "-" + d.slice(6);
    return d.slice(0, 3) + "-" + d.slice(3, 7) + "-" + d.slice(7);
  }

  function isValidPhone(v) {
    var d = String(v || "").replace(/\D/g, "");
    return /^01[016789]\d{7,8}$/.test(d);
  }

  function phoneE164() {
    var d = String(state.phone || "").replace(/[^0-9]/g, "");
    if (!d) return "";
    if (d.indexOf("0") === 0) return "+82" + d.slice(1);
    return "+" + d;
  }

  function isDesktopEnv() {
    try {
      return window.matchMedia("(min-width:900px)").matches && !window.matchMedia("(pointer: coarse)").matches;
    } catch (e) { return window.innerWidth >= 900; }
  }

  /* ------------------------------------------------------------- 마크업 */
  function chipGroup(opts) {
    var group = opts.group;
    var items = opts.items;
    var btns = items.map(function (it) {
      var val = opts.sub ? it[0] : it;
      var text = opts.sub ? it[1] : it;
      var sub = (opts.sub && it[2]) ? " <small>" + esc(it[2]) + "</small>" : "";
      return '<button class="hrc-chip" type="button" data-group="' + esc(group) + '" data-value="' + esc(val) + '" aria-pressed="false">' + esc(text) + sub + "</button>";
    }).join("");
    return '' +
      '<div class="hrc-field" data-field="' + group + '">' +
        "<span class=\"hrc-label\">" + opts.label + ' <span class="hrc-req">*</span></span>' +
        '<div class="hrc-chips" role="group" aria-label="' + esc(opts.aria || opts.label) + '">' + btns + "</div>" +
        (opts.extra || "") +
        '<p class="hrc-err" role="alert">' + ERR_SVG + " " + esc(opts.err) + "</p>" +
      "</div>";
  }

  function inputField(opts) {
    var optional = opts.optional ? ' <span class="hrc-opt">선택</span>' : ' <span class="hrc-req">*</span>';
    var control;
    if (opts.textarea) {
      control = '<textarea class="hrc-input" id="' + opts.id + '" rows="' + (opts.rows || 2) + '" maxlength="200" placeholder="' + esc(opts.placeholder) + '"></textarea>';
    } else {
      control = '<input class="hrc-input" id="' + opts.id + '" type="' + (opts.type || "text") + '"' +
        (opts.inputmode ? ' inputmode="' + opts.inputmode + '"' : "") +
        (opts.autocomplete ? ' autocomplete="' + opts.autocomplete + '"' : ' autocomplete="off"') +
        (opts.maxlength ? ' maxlength="' + opts.maxlength + '"' : "") +
        ' placeholder="' + esc(opts.placeholder) + '">';
    }
    return '' +
      '<div class="hrc-field" data-field="' + opts.field + '">' +
        '<label class="hrc-label" for="' + opts.id + '">' + opts.label + optional + "</label>" +
        control +
        (opts.optional ? "" : '<p class="hrc-err" role="alert">' + ERR_SVG + " " + esc(opts.err) + "</p>") +
      "</div>";
  }

  function consentBlock(label) {
    return '' +
      '<div class="hr-consent" id="hrcConsentWrap">' +
        '<label class="hr-consent-row" for="hrcAgree">' +
          '<input type="checkbox" id="hrcAgree">' +
          '<span class="hr-consent-box" aria-hidden="true">' + CHECK_SVG + "</span>" +
          '<span class="hr-consent-text"><b>[필수]</b> 개인정보 수집 및 이용 동의</span>' +
        "</label>" +
        '<button class="hr-consent-view" type="button" id="hrcAgreeView" aria-expanded="false" aria-controls="hrcAgreeDetail">' +
          '<span class="hr-consent-view-t">자세히 보기</span>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>' +
        "</button>" +
        '<div class="hr-consent-detail is-hidden" id="hrcAgreeDetail">' +
          "<p><strong>수집항목</strong> 연락처, 차량·상담 정보</p>" +
          "<p><strong>이용 목적</strong> " + esc(label) + " 및 배차 안내</p>" +
          "<p><strong>보유기간</strong> 상담 종료 후 지체 없이 파기</p>" +
          "<p>동의를 거부하실 수 있으나, 거부 시 상담 신청이 제한됩니다.</p>" +
        "</div>" +
        '<p class="hr-consent-err is-hidden" id="hrcAgreeErr">' + ERR_SVG + " 개인정보 수집 및 이용에 동의해 주세요.</p>" +
      "</div>";
  }

  function buildForm() {
    var head, fields, cta, consentLabel;

    if (VARIANT === "rental") {
      head = { title: "일반렌트 상담", sub: "이용 구분과 기간만 고르면 조건에 맞춰 견적을 안내드립니다." };
      cta = "견적 상담 신청";
      consentLabel = "일반렌트 상담";
      fields = "" +
        chipGroup({ group: "who", label: "이용 구분", items: WHOS, err: "이용 구분을 선택해 주세요.", aria: "이용 구분 선택" }) +
        chipGroup({ group: "term", label: "이용 기간", items: TERMS, sub: true, err: "이용 기간을 선택해 주세요.", aria: "이용 기간 선택" }) +
        inputField({ field: "phone", id: "hrcPhone", label: "연락처", type: "tel", inputmode: "numeric", autocomplete: "tel", maxlength: 13, placeholder: "010-0000-0000", err: "휴대폰 번호를 정확히 입력해 주세요. (예: 010-1234-5678)" }) +
        inputField({ field: "memo", id: "hrcMemo", label: "메모", optional: true, textarea: true, rows: 2, placeholder: "예) E200, 카이엔 쿠페 / 서울 강남구 인수 희망" });
    } else {
      head = { title: "사고대차 상담", sub: "사고 차량 배기량만 확인되면 바로 배차 가능 여부를 안내드립니다." };
      cta = "무료 대차 상담 신청";
      consentLabel = "사고대차 상담";
      fields = "" +
        chipGroup({
          group: "brand", label: "브랜드", items: BRANDS, sub: true,
          err: "브랜드를 선택해 주세요.", aria: "브랜드 선택",
          extra: '<input class="hrc-input hrc-etc" id="hrcBrandEtc" type="text" autocomplete="off" placeholder="브랜드를 직접 입력해 주세요 (예: 폴크스바겐)" hidden>'
        }) +
        inputField({ field: "model", id: "hrcModel", label: "차종", placeholder: "예) 그랜저, E클래스, 쏘렌토", err: "차종을 입력해 주세요." }) +
        chipGroup({ group: "cc", label: "배기량", items: CCS, sub: true, err: "배기량을 선택해 주세요.", aria: "배기량 선택" }) +
        chipGroup({ group: "region", label: "지역", items: REGIONS, err: "지역을 선택해 주세요.", aria: "지역 선택" }) +
        inputField({ field: "phone", id: "hrcPhone", label: "연락처", type: "tel", inputmode: "numeric", autocomplete: "tel", maxlength: 13, placeholder: "010-0000-0000", err: "휴대폰 번호를 정확히 입력해 주세요. (예: 010-1234-5678)" });
    }

    return '' +
      '<div class="hrc-grip" aria-hidden="true"></div>' +
      '<div class="hrc-head">' +
        '<span class="hrc-micon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.3-.7L3 21l1.8-4.5A8.4 8.4 0 0 1 3.6 11 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z"/><path d="M8.5 10.5h7M8.5 13.5h4"/></svg></span>' +
        '<div class="hrc-head-txt">' +
          '<h3 class="hrc-title" id="hrcFormTitle">' + esc(head.title) + "</h3>" +
          '<p class="hrc-sub">' + esc(head.sub) + "</p>" +
        "</div>" +
        '<button class="hrc-close" type="button" data-hrc-close aria-label="닫기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>' +
      "</div>" +
      '<form class="hrc-form" id="hrcFormEl" novalidate autocomplete="on">' +
        '<div class="hrc-body">' + fields + consentBlock(consentLabel) + "</div>" +
        '<div class="hrc-foot">' +
          '<button class="hrc-submit" type="submit">' + esc(cta) +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>' +
          "</button>" +
          '<p class="hrc-note">입력하신 연락처는 상담 목적으로만 사용됩니다.</p>' +
        "</div>" +
      "</form>";
  }

  function buildSummary() {
    return '' +
      '<div class="hrc-grip" aria-hidden="true"></div>' +
      '<div class="hrc-head">' +
        '<span class="hrc-micon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5"/><path d="m9.5 15 1.8 1.8L14.8 13"/></svg></span>' +
        '<div class="hrc-head-txt">' +
          '<h3 class="hrc-title" id="hrcSumTitle">상담 신청 내용을 확인해 주세요</h3>' +
          '<p class="hrc-sub">아래 내용으로 상담을 이어갑니다. 편한 방법을 선택해 주세요.</p>' +
        "</div>" +
        '<button class="hrc-close" type="button" data-hrc-close aria-label="닫기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>' +
      "</div>" +
      '<div class="hrc-body">' +
        '<dl class="hrc-summary" id="hrcSummaryList"></dl>' +
        '<div class="hrc-actions">' +
          '<a class="hrc-chan is-primary" id="hrcCall" href="tel:' + PHONE + '" aria-label="전화 상담 ' + PHONE_DISPLAY + '">' +
            '<span class="t"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z"/></svg>전화 상담</span>' +
            '<span class="n">' + PHONE_DISPLAY + "</span>" +
          "</a>" +
          '<a class="hrc-chan" id="hrcSms" href="sms:' + PHONE + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="15" rx="3"/><path d="M7.5 9.5h9M7.5 13h6"/></svg>문자로 보내기' +
          "</a>" +
          '<button class="hrc-chan" type="button" id="hrcChannel">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.3-.7L3 21l1.8-4.5A8.4 8.4 0 0 1 3.6 11 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z"/></svg>채널톡 상담' +
          "</button>" +
        "</div>" +
        '<div class="hrc-callout" id="hrcCallout">' +
          '<p class="cap">전화 주시면 바로 확인해 드립니다</p>' +
          '<p class="big">' + PHONE_DISPLAY + "</p>" +
          '<button class="copy" type="button" id="hrcCopyNum">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>' +
            '<span id="hrcCopyNumLabel">번호 복사</span>' +
          "</button>" +
          '<p class="help">휴대폰·유선전화 어디서든 통화 연결됩니다. 통화가 어려우면 채널톡으로 남겨 주세요.</p>' +
        "</div>" +
        '<p class="hrc-fine">입력하신 연락처는 상담 목적으로만 사용됩니다.</p>' +
      "</div>";
  }

  /* ------------------------------------------------------------- 값/표시 */
  function brandText() {
    if (!state.brand) return "";
    if (state.brand === "etc") return String(state.brandEtc || "").trim() || "기타";
    for (var i = 0; i < BRANDS.length; i++) if (BRANDS[i][0] === state.brand) return BRANDS[i][1];
    return state.brand;
  }
  function ccText() {
    for (var i = 0; i < CCS.length; i++) if (CCS[i][0] === state.cc) return CCS[i][1] + " (" + CCS[i][2] + ")";
    return "";
  }
  function termText() {
    for (var i = 0; i < TERMS.length; i++) if (TERMS[i][0] === state.term) return TERMS[i][0];
    return "";
  }
  function memoText() { return String(state.memo || "").trim(); }

  function summaryRows() {
    if (VARIANT === "rental") {
      var r = [["이용 구분", state.who], ["이용 기간", termText()], ["연락처", state.phone]];
      if (memoText()) r.push(["메모", memoText()]);
      return r;
    }
    return [["브랜드", brandText()], ["차종", String(state.model || "").trim()], ["배기량", ccText()], ["지역", state.region], ["연락처", state.phone]];
  }

  function summaryText() {
    var head = VARIANT === "rental" ? "[하하렌트 일반렌트 상담 신청]" : "[하하렌트 사고대차 상담 신청]";
    var lines = [head, ""];
    summaryRows().forEach(function (r) { lines.push("· " + r[0] + " : " + r[1]); });
    lines.push("", VARIANT === "rental" ? "위 조건으로 일반렌트 견적 상담 신청합니다." : "위 내용으로 대차 상담 신청합니다.");
    return lines.join("\n");
  }

  /* --------------------------------------------------------------- 채널톡 */
  function channelStatus() {
    return (window.HAHA_RENT && window.HAHA_RENT.channelStatus) || "";
  }

  function profile() {
    var p = { mobileNumber: phoneE164() };
    if (VARIANT === "rental") {
      p["이용구분"] = state.who;
      p["이용기간"] = termText();
      if (memoText()) p["메모"] = memoText();
    } else {
      p["브랜드"] = brandText();
      p["차종"] = String(state.model || "").trim();
      p["배기량"] = ccText();
      p["지역"] = state.region;
    }
    return p;
  }

  function trackProps() {
    var p = { "상담경로": "플로팅 상담" };
    if (VARIANT === "rental") {
      p["이용구분"] = state.who;
      p["이용기간"] = termText();
      if (memoText()) p["메모"] = memoText();
    } else {
      p["브랜드"] = brandText();
      p["차종"] = String(state.model || "").trim();
      p["배기량"] = ccText();
      p["지역"] = state.region;
    }
    p["연락처"] = state.phone;
    return p;
  }

  function syncChannel() {
    var api = window.ChannelIO;
    if (typeof api !== "function" || channelStatus() !== "ok") return;
    try {
      api("updateUser", { profile: profile() });
      api("track", VARIANT === "rental" ? "일반렌트_플로팅상담" : "사고대차_플로팅상담", trackProps());
    } catch (e) {}
  }

  function openChannel(msg) {
    var api = window.ChannelIO;
    var st = channelStatus();
    if (typeof api === "function" && (st === "ok" || st === "pending")) {
      try { api("updateUser", { profile: profile() }); } catch (e) {}
      /* openChat 으로 대화를 열고(신청 요약을 첫 메시지로), SDK 버전에 따라 열리지 않으면 메신저 열기를 한 번 더 보냅니다. */
      try {
        if (msg) api("openChat", undefined, msg);
        else api("openChat");
      } catch (e2) {}
      setTimeout(function () {
        try { api("showMessenger"); } catch (e3) {}
      }, 400);
      if (st === "pending") {
        setTimeout(function () {
          if (channelStatus() !== "ok") openFallbackSheet();
        }, 2600);
      }
      return;
    }
    openFallbackSheet();
  }

  function openFallbackSheet() {
    var t = document.querySelector("[data-open-channel]");
    if (t) { try { t.click(); return; } catch (e) {} }
    showToast("채널톡 연결이 지연되고 있어요. 전화 " + PHONE_DISPLAY + " 로 문의해 주세요.");
  }

  /* ---------------------------------------------------------- 광고 전환 */
  function adsConversion(kind, params) {
    try {
      var a = window.HAHA_ADS;
      if (!a || typeof window.gtag !== "function") return;
      var label = a.labels && a.labels[kind];
      if (!label) return;
      var payload = { send_to: a.conversionId + "/" + label };
      if (params) for (var k in params) if (Object.prototype.hasOwnProperty.call(params, k)) payload[k] = params[k];
      window.gtag("event", "conversion", payload);
    } catch (e) {}
  }

  /* ------------------------------------------------------------- 토스트 */
  function toastEl() {
    var el = $("hrcToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "hrcToast";
      el.className = "hrc-toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    return el;
  }
  function showToast(msg) {
    var el = toastEl();
    el.textContent = msg;
    el.classList.add("is-on");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("is-on"); }, 2800);
  }

  /* --------------------------------------------------------------- 복사 */
  function copyPlain(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
    } else {
      done(fallbackCopy(text));
    }
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  /* -------------------------------------------------------------- 검증 */
  function fieldEl(name) {
    return els.form.querySelector('.hrc-field[data-field="' + name + '"]');
  }
  function markBad(name) { var f = fieldEl(name); if (f) f.classList.add("is-bad"); }
  function clearBad(name) { var f = fieldEl(name); if (f) f.classList.remove("is-bad"); }
  function clearAllBad() {
    Array.prototype.forEach.call(els.form.querySelectorAll(".hrc-field"), function (f) { f.classList.remove("is-bad"); });
    els.consentWrap.classList.remove("has-error");
    els.agreeErr.classList.add("is-hidden");
  }

  function validate() {
    var bad = [];
    if (VARIANT === "rental") {
      if (!state.who) bad.push("who");
      if (!state.term) bad.push("term");
    } else {
      if (!state.brand || (state.brand === "etc" && !String(state.brandEtc || "").trim())) bad.push("brand");
      if (!String(state.model || "").trim()) bad.push("model");
      if (!state.cc) bad.push("cc");
      if (!state.region) bad.push("region");
    }
    if (!isValidPhone(state.phone)) bad.push("phone");
    if (!state.agree) {
      els.consentWrap.classList.add("has-error");
      els.agreeErr.classList.remove("is-hidden");
      bad.push("agree");
    }
    bad.forEach(function (n) { if (n !== "agree") markBad(n); });
    return bad.length ? bad[0] : null;
  }

  function focusFirst(name) {
    if (name === "agree") {
      try { els.consentWrap.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {}
      setTimeout(function () { try { els.agree.focus({ preventScroll: true }); } catch (e) {} }, 240);
      return;
    }
    var f = fieldEl(name);
    if (!f) return;
    try { f.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {}
    var target = f.querySelector("input, textarea") || f.querySelector(".hrc-chip");
    if (target) setTimeout(function () { try { target.focus({ preventScroll: true }); } catch (e) {} }, 220);
  }

  /* --------------------------------------------------------------- 패널 */
  function bodyOf(panel) { return panel.querySelector(".hrc-body"); }

  function showPanel(which) {
    if (which === "summary") {
      els.panelForm.hidden = true;
      els.panelSummary.hidden = false;
      var b1 = bodyOf(els.panelSummary);
      if (b1) b1.scrollTop = 0;
    } else {
      els.panelSummary.hidden = true;
      els.panelForm.hidden = false;
      var b2 = bodyOf(els.panelForm);
      if (b2) b2.scrollTop = 0;
    }
  }

  function renderSummary() {
    els.summaryList.innerHTML = "";
    summaryRows().forEach(function (r) {
      var row = document.createElement("div");
      row.className = "hrc-sum";
      var dt = document.createElement("dt");
      dt.textContent = r[0];
      var dd = document.createElement("dd");
      dd.textContent = r[1];
      row.appendChild(dt);
      row.appendChild(dd);
      els.summaryList.appendChild(row);
    });
    var sms = $("hrcSms");
    if (sms) sms.href = "sms:" + PHONE + "?body=" + encodeURIComponent(summaryText());
    els.callout.classList.remove("is-on");
    var lbl = $("hrcCopyNumLabel");
    if (lbl) lbl.textContent = "번호 복사";
  }

  function open() {
    lastFocused = document.activeElement;
    els.root.hidden = false;
    void els.root.offsetWidth;
    els.root.classList.add("is-open");
    document.body.classList.add("hrc-lock");
    showPanel("form");
  }

  function close() {
    els.root.classList.remove("is-open");
    document.body.classList.remove("hrc-lock");
    els.callout.classList.remove("is-on");
    setTimeout(function () {
      if (!els.root.classList.contains("is-open")) els.root.hidden = true;
    }, 240);
    if (lastFocused && lastFocused.focus) {
      setTimeout(function () { try { lastFocused.focus({ preventScroll: true }); } catch (e) {} }, 60);
    }
  }

  /* --------------------------------------------------------------- mount */
  function mount() {
    var root = document.createElement("div");
    root.className = "hrc-root";
    root.id = "hrcRoot";
    root.hidden = true;
    root.innerHTML = '' +
      '<div class="hrc-overlay" data-hrc-close></div>' +
      '<div class="hrc-stage">' +
        '<div class="hrc-modal" id="hrcPanelForm" role="dialog" aria-modal="true" aria-labelledby="hrcFormTitle">' + buildForm() + "</div>" +
        '<div class="hrc-modal" id="hrcPanelSummary" role="dialog" aria-modal="true" aria-labelledby="hrcSumTitle" hidden>' + buildSummary() + "</div>" +
      "</div>";
    document.body.appendChild(root);

    els.root = root;
    els.panelForm = $("hrcPanelForm");
    els.panelSummary = $("hrcPanelSummary");
    els.form = $("hrcFormEl");
    els.summaryList = $("hrcSummaryList");
    els.callout = $("hrcCallout");
    els.consentWrap = $("hrcConsentWrap");
    els.agree = $("hrcAgree");
    els.agreeErr = $("hrcAgreeErr");

    /* --- 칩 선택 --- */
    Array.prototype.forEach.call(els.form.querySelectorAll(".hrc-chip"), function (chip) {
      chip.addEventListener("click", function () {
        var group = chip.getAttribute("data-group");
        var value = chip.getAttribute("data-value");
        state[group] = (state[group] === value) ? "" : value;
        Array.prototype.forEach.call(els.form.querySelectorAll('.hrc-chip[data-group="' + group + '"]'), function (c) {
          c.setAttribute("aria-pressed", c.getAttribute("data-value") === state[group] ? "true" : "false");
        });
        if (group === "brand") {
          var e = $("hrcBrandEtc");
          if (e) {
            e.hidden = state.brand !== "etc";
            if (state.brand === "etc") setTimeout(function () { try { e.focus(); } catch (err) {} }, 60);
            else { e.value = ""; state.brandEtc = ""; }
          }
        }
        clearBad(group);
      });
    });

    /* --- 브랜드 기타 --- */
    var etcInput = $("hrcBrandEtc");
    if (etcInput) {
      etcInput.addEventListener("input", function () {
        state.brandEtc = etcInput.value;
        clearBad("brand");
      });
    }

    /* --- 차종 / 메모 --- */
    var model = $("hrcModel");
    if (model) {
      model.addEventListener("input", function () { state.model = model.value; clearBad("model"); });
    }
    var memo = $("hrcMemo");
    if (memo) {
      memo.addEventListener("input", function () { state.memo = memo.value; });
    }

    /* --- 연락처 --- */
    var phone = $("hrcPhone");
    if (phone) {
      phone.addEventListener("input", function () {
        var pos = phone.selectionStart;
        var before = phone.value.length;
        phone.value = formatPhone(phone.value);
        if (before !== phone.value.length && pos !== null) {
          try { phone.setSelectionRange(phone.value.length, phone.value.length); } catch (e) {}
        }
        state.phone = phone.value;
        if (isValidPhone(state.phone)) clearBad("phone");
      });
      phone.addEventListener("blur", function () {
        state.phone = phone.value;
        if (state.phone && !isValidPhone(state.phone)) markBad("phone");
      });
    }

    /* --- 개인정보 동의 --- */
    els.agree.addEventListener("change", function () {
      state.agree = els.agree.checked;
      if (state.agree) {
        els.consentWrap.classList.remove("has-error");
        els.agreeErr.classList.add("is-hidden");
      }
    });
    var viewBtn = $("hrcAgreeView");
    viewBtn.addEventListener("click", function () {
      var detail = $("hrcAgreeDetail");
      var openNow = viewBtn.getAttribute("aria-expanded") !== "true";
      viewBtn.setAttribute("aria-expanded", openNow ? "true" : "false");
      detail.classList.toggle("is-hidden", !openNow);
      var t = viewBtn.querySelector(".hr-consent-view-t");
      if (t) t.textContent = openNow ? "접기" : "자세히 보기";
      if (openNow && detail) setTimeout(function () { try { detail.scrollIntoView({ block: "nearest" }); } catch (e) {} }, 60);
    });

    /* --- 제출 --- */
    els.form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (phone) state.phone = phone.value;
      clearAllBad();
      var firstBad = validate();
      if (firstBad) { focusFirst(firstBad); return; }
      renderSummary();
      syncChannel();
      adsConversion("form", { value: 0, currency: "KRW", transaction_id: "HRP-" + Date.now() });
      showPanel("summary");
    });

    /* --- 요약 화면 연결 --- */
    $("hrcCall").addEventListener("click", function (e) {
      adsConversion("phone");
      if (!isDesktopEnv()) return;
      e.preventDefault();
      els.callout.classList.add("is-on");
      var btn = $("hrcCopyNum");
      if (btn) { try { btn.focus({ preventScroll: true }); } catch (err) {} }
    });
    $("hrcSms").addEventListener("click", function () { adsConversion("sms"); });
    $("hrcCopyNum").addEventListener("click", function () {
      copyPlain(PHONE_DISPLAY, function (ok) {
        var lbl = $("hrcCopyNumLabel");
        if (!ok) { showToast("복사가 막혔어요. 번호는 " + PHONE_DISPLAY + " 입니다."); return; }
        if (lbl) lbl.textContent = "복사 완료";
        showToast("번호를 복사했어요. 전화로 걸어주세요.");
        if (copyTimer) clearTimeout(copyTimer);
        copyTimer = setTimeout(function () { if (lbl) lbl.textContent = "번호 복사"; }, 2400);
      });
    });
    $("hrcChannel").addEventListener("click", function () {
      adsConversion("channel");
      var text = summaryText();
      copyPlain(text, function () {});
      close();
      setTimeout(function () { openChannel(text); }, 220);
    });

    /* --- 닫기 --- */
    Array.prototype.forEach.call(root.querySelectorAll("[data-hrc-close]"), function (el) {
      el.addEventListener("click", close);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && root.classList.contains("is-open")) close();
    });

    /* --- 플로팅 상담하기 버튼 (문서 위임) --- */
    document.addEventListener("click", function (e) {
      var t = e.target;
      var btn = t && t.closest ? t.closest("[data-open-consult]") : null;
      if (!btn) return;
      e.preventDefault();
      open();
    });

    /* --- 본문 폼의 개인정보 '자세히 보기' 토글 (페이지 공통) --- */
    Array.prototype.forEach.call(document.querySelectorAll("[data-consent-view]"), function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("aria-controls");
        var detail = id ? document.getElementById(id) : null;
        var openNow = btn.getAttribute("aria-expanded") !== "true";
        btn.setAttribute("aria-expanded", openNow ? "true" : "false");
        if (detail) detail.classList.toggle("is-hidden", !openNow);
        var t = btn.querySelector(".hr-consent-view-t");
        if (t) t.textContent = openNow ? "접기" : "자세히 보기";
        if (openNow && detail) setTimeout(function () { try { detail.scrollIntoView({ block: "nearest" }); } catch (e) {} }, 60);
      });
    });
  }

  window.HAHA_CONSULT_OPEN = open;
  window.HAHA_CONSULT_CLOSE = close;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
