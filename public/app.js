(function(){
  "use strict";

  var AUTH_KEY = "epp_admin_auth_v1";
  var ADMIN_PIN = "1122";
  var offers = [];

  function escapeHtml(str){
    return String(str)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }

  function val(id){
    var el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }

  /* ---------- RENDER OFFERS ---------- */
  function offerCardHtml(o){
    return (
      '<div class="offer-card reveal visible">' +
        '<div class="offer-top">' +
          '<div class="offer-title">' + escapeHtml(o.title) + '</div>' +
          '<div class="offer-payout">' + escapeHtml(o.payout) + '</div>' +
        '</div>' +
        '<div class="offer-meta">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C8 2 5 5.5 5 9.5 5 15 12 22 12 22s7-7 7-12.5C19 5.5 16 2 12 2z"/><circle cx="12" cy="9.5" r="2.4"/></svg>' +
          escapeHtml(o.geo) +
        '</div>' +
        '<div class="offer-desc">' + escapeHtml(o.desc || "") + '</div>' +
        '<a href="contact.html" class="btn btn-outline-emerald btn-sm">Request Access</a>' +
      '</div>'
    );
  }

  function renderOffers(){
    var grid = document.getElementById("offersGrid");
    if(grid){
      grid.innerHTML = offers.length ? offers.map(offerCardHtml).join("") :
        '<div class="offers-empty">No active offers right now — check back shortly.</div>';
    }
    var preview = document.getElementById("offersGridPreview");
    if(preview){
      var subset = offers.slice(0, 3);
      preview.innerHTML = subset.length ? subset.map(offerCardHtml).join("") :
        '<div class="offers-empty">No active offers right now — check back shortly.</div>';
    }
    renderAdminList();
  }

  function applyOffers(list){
    offers = Array.isArray(list) ? list : [];
    renderOffers();
  }

  function fetchOffers(){
    return fetch("/api/offers")
      .then(function(res){ return res.json(); })
      .then(applyOffers)
      .catch(function(){ /* stream will retry */ });
  }

  function initOffersStream(){
    if(typeof EventSource === "undefined"){
      fetchOffers();
      setInterval(fetchOffers, 8000);
      return;
    }
    var es = new EventSource("/api/offers/stream");
    es.onmessage = function(e){
      try{ applyOffers(JSON.parse(e.data)); }catch(err){ /* ignore */ }
    };
    es.onerror = function(){
      fetchOffers();
    };
  }

  /* ---------- LIVE TICKER ---------- */
  var tickerVerticals = [
    {tag:"MEDICARE", geo:"FL"}, {tag:"FINAL EXPENSE", geo:"OH"},
    {tag:"AUTO", geo:"TX"}, {tag:"HOME SERVICES", geo:"AZ"},
    {tag:"MEDICARE", geo:"NC"}, {tag:"AUTO", geo:"GA"},
    {tag:"FINAL EXPENSE", geo:"PA"}, {tag:"HOME SERVICES", geo:"CO"},
    {tag:"MEDICARE", geo:"CA"}, {tag:"AUTO", geo:"IL"}
  ];
  function randPayout(min, max){ return "$" + (Math.random()*(max-min)+min).toFixed(0); }
  function buildTicker(){
    var track = document.getElementById("tickerTrack");
    if(!track) return;
    var items = tickerVerticals.map(function(t){
      return '<div class="ticker-item"><span class="tag">' + t.tag + '</span><span>' + t.geo + '</span><span>&rarr; connected</span><span class="payout">' + randPayout(18,68) + '</span></div>';
    });
    var html = items.join("");
    track.innerHTML = html + html;
  }

  /* ---------- REVEAL ON SCROLL ---------- */
  function initReveal(){
    var els = document.querySelectorAll(".reveal");
    if(!els.length) return;
    if(!("IntersectionObserver" in window)){
      els.forEach(function(el){ el.classList.add("visible"); });
      return;
    }
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          entry.target.classList.add("visible");
          io.unobserve(entry.target);
        }
      });
    }, {threshold:0.12});
    els.forEach(function(el){ io.observe(el); });
  }

  /* ---------- MOBILE MENU ---------- */
  function initMobileMenu(){
    var burgerBtn = document.getElementById("burgerBtn");
    var mobileMenu = document.getElementById("mobileMenu");
    if(!burgerBtn || !mobileMenu) return;
    burgerBtn.addEventListener("click", function(){
      var isOpen = mobileMenu.classList.toggle("open");
      burgerBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
    mobileMenu.querySelectorAll("a").forEach(function(a){
      a.addEventListener("click", function(){
        mobileMenu.classList.remove("open");
        burgerBtn.setAttribute("aria-expanded","false");
      });
    });
  }

  function markActiveNav(){
    var path = (window.location.pathname.split("/").pop() || "index.html");
    document.querySelectorAll(".nav-links a, .mobile-menu a").forEach(function(a){
      var href = a.getAttribute("href");
      if(href === path || (path === "" && href === "index.html")){
        a.classList.add("active");
      }
    });
  }

  var toastTimer = null;
  function showToast(msg){
    var toastEl = document.getElementById("toast");
    if(!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ toastEl.classList.remove("show"); }, 2800);
  }

  /* ---------- PUBLISHER APPLY / CONTACT FORM ---------- */
  function initContactForm(){
    var form = document.getElementById("contactForm");
    if(!form) return;
    var successEl = document.getElementById("formSuccess");
    var errorEl = document.getElementById("formError");

    form.addEventListener("submit", function(e){
      e.preventDefault();
      var submitBtn = form.querySelector("button[type=submit]");
      if(submitBtn){ submitBtn.disabled = true; submitBtn.textContent = "Sending..."; }
      if(successEl) successEl.classList.remove("show");
      if(errorEl) errorEl.classList.remove("show");

      var payload = {
        name: val("fName"),
        email: val("fEmail"),
        company: val("fCompany"),
        teams_id: val("fTeams"),
        data_sample: val("fDataSample"),
        sample_recording: val("fRecording"),
        user_type: "Publisher",
        message: val("fMessage")
      };

      fetch("/submit-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload)
      })
      .then(function(res){ if(!res.ok) throw new Error("Request failed"); return res.json().catch(function(){ return {}; }); })
      .then(function(){
        if(successEl) successEl.classList.add("show");
        form.reset();
        showToast("Application received — we'll be in touch soon.");
      })
      .catch(function(){
        if(errorEl) errorEl.classList.add("show");
        showToast("Something went wrong sending your application.");
      })
      .finally(function(){
        if(submitBtn){ submitBtn.disabled = false; submitBtn.textContent = "Submit Application"; }
      });
    });
  }

  /* ---------- BUYER OFFER FORM ---------- */
  function initBuyerOfferForm(){
    var form = document.getElementById("buyerOfferForm");
    if(!form) return;
    var successEl = document.getElementById("offerFormSuccess");
    var errorEl = document.getElementById("offerFormError");
    var submitBtn = document.getElementById("offerSubmitBtn");

    form.addEventListener("submit", function(e){
      e.preventDefault();
      if(successEl) successEl.classList.remove("show");
      if(errorEl) errorEl.classList.remove("show");
      if(submitBtn){ submitBtn.disabled = true; submitBtn.textContent = "Sending..."; }

      var combinedMessage =
        "Vertical / Niche: " + val("boVertical") +
        "\nProposed Payout: " + val("boPayout") +
        "\nGeo-Targeting: " + val("boGeo") +
        "\nExpected Monthly Volume: " + val("boVolume") +
        "\nPhone: " + val("boPhone") +
        "\n\nOffer Details:\n" + val("boDetails");

      var payload = {
        name: val("boName"),
        email: val("boEmail"),
        company: val("boCompany"),
        user_type: "Buyer",
        message: combinedMessage
      };

      fetch("/submit-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload)
      })
      .then(function(res){ if(!res.ok) throw new Error("Request failed"); return res.json().catch(function(){ return {}; }); })
      .then(function(){
        if(successEl) successEl.classList.add("show");
        form.reset();
        showToast("Offer sent — our team will review it shortly.");
      })
      .catch(function(){
        if(errorEl) errorEl.classList.add("show");
        showToast("Something went wrong sending your offer.");
      })
      .finally(function(){
        if(submitBtn){ submitBtn.disabled = false; submitBtn.textContent = "Send Offer for Review"; }
      });
    });
  }

  /* ---------- ADMIN LIST (shared with live feed) ---------- */
  function renderAdminList(){
    var list = document.getElementById("adminOfferList");
    if(!list) return;
    if(!offers.length){
      list.innerHTML = '<div class="admin-empty">No offers yet. Add one on the left.</div>';
      return;
    }
    list.innerHTML = offers.map(function(o){
      return (
        '<div class="admin-offer-row" data-id="' + escapeHtml(o.id) + '">' +
          '<div class="info">' +
            '<div class="t">' + escapeHtml(o.title) + '</div>' +
            '<div class="m">' + escapeHtml(o.payout) + ' &middot; ' + escapeHtml(o.geo) + '</div>' +
          '</div>' +
          '<button class="admin-del" type="button" aria-label="Delete offer" data-del="' + escapeHtml(o.id) + '">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z"/></svg>' +
          '</button>' +
        '</div>'
      );
    }).join("");

    list.querySelectorAll("[data-del]").forEach(function(btn){
      btn.addEventListener("click", function(){
        var id = btn.getAttribute("data-del");
        fetch("/api/offers/" + encodeURIComponent(id), {
          method: "DELETE",
          credentials: "include"
        })
        .then(function(res){
          if(res.status === 401) throw new Error("auth");
          if(!res.ok) throw new Error("fail");
        })
        .then(function(){ showToast("Offer removed from live feed."); })
        .catch(function(err){
          showToast(err.message === "auth" ? "Please log in again to manage offers." : "Could not remove offer.");
        });
      });
    });
  }

  /* ---------- ADMIN PORTAL ---------- */
  function initAdmin(){
    var pinOverlay = document.getElementById("pinOverlay");
    var dashOverlay = document.getElementById("dashOverlay");
    if(!pinOverlay || !dashOverlay) return;

    var pinDots = document.querySelectorAll("#pinDots .pin-dot");
    var pinError = document.getElementById("pinError");
    var enteredPin = "";

    function openPinModal(){
      enteredPin = "";
      updatePinDots();
      if(pinError) pinError.textContent = "\u00A0";
      pinOverlay.classList.add("open");
    }
    function closePinModal(){ pinOverlay.classList.remove("open"); }
    function updatePinDots(){
      pinDots.forEach(function(dot, i){
        dot.classList.toggle("filled", i < enteredPin.length);
      });
    }

    var openBtn = document.getElementById("openAdminBtn");
    var openBtnFooter = document.getElementById("openAdminBtnFooter");
    if(openBtn) openBtn.addEventListener("click", openPinModal);
    if(openBtnFooter) openBtnFooter.addEventListener("click", function(e){ e.preventDefault(); openPinModal(); });

    var closePinBtn = document.getElementById("closePinModal");
    if(closePinBtn) closePinBtn.addEventListener("click", closePinModal);
    pinOverlay.addEventListener("click", function(e){ if(e.target === pinOverlay) closePinModal(); });

    document.querySelectorAll(".pin-key").forEach(function(btn){
      btn.addEventListener("click", function(){
        var key = btn.getAttribute("data-key");
        if(key === "clear"){ enteredPin = ""; updatePinDots(); if(pinError) pinError.textContent = "\u00A0"; return; }
        if(key === "back"){ enteredPin = enteredPin.slice(0,-1); updatePinDots(); return; }
        if(enteredPin.length >= 4) return;
        enteredPin += key;
        updatePinDots();
        if(enteredPin.length === 4){
          setTimeout(function(){ checkPin(); }, 150);
        }
      });
    });

    function checkPin(){
      fetch("/api/admin/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ pin: enteredPin })
      })
      .then(function(res){
        if(!res.ok) throw new Error("bad");
        try{ localStorage.setItem(AUTH_KEY, "1"); }catch(e){}
        if(pinError) pinError.textContent = "\u00A0";
        closePinModal();
        openDashboard();
      })
      .catch(function(){
        if(enteredPin === ADMIN_PIN){
          if(pinError) pinError.textContent = "Server login failed. Start the site with npm start.";
        }else if(pinError){
          pinError.textContent = "Incorrect PIN. Try again.";
        }
        enteredPin = "";
        updatePinDots();
      });
    }

    function openDashboard(){
      renderAdminList();
      dashOverlay.classList.add("open");
    }
    function closeDashboard(){ dashOverlay.classList.remove("open"); }

    var closeDashBtn = document.getElementById("closeDashModal");
    if(closeDashBtn) closeDashBtn.addEventListener("click", closeDashboard);
    dashOverlay.addEventListener("click", function(e){ if(e.target === dashOverlay) closeDashboard(); });

    var logoutBtn = document.getElementById("logoutAdminBtn");
    if(logoutBtn) logoutBtn.addEventListener("click", function(){
      fetch("/api/admin/logout", { method: "POST", credentials: "include" }).catch(function(){});
      try{ localStorage.setItem(AUTH_KEY, "0"); }catch(e){}
      closeDashboard();
      showToast("Logged out of Admin Portal.");
    });

    var addForm = document.getElementById("addOfferForm");
    if(addForm){
      addForm.addEventListener("submit", function(e){
        e.preventDefault();
        var title = val("oTitle");
        var payout = val("oPayout");
        var geo = val("oGeo");
        var desc = val("oDesc");
        if(!title || !payout || !geo) return;

        fetch("/api/offers", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ title: title, payout: payout, geo: geo, desc: desc })
        })
        .then(function(res){
          if(res.status === 401) throw new Error("auth");
          if(!res.ok) throw new Error("fail");
          addForm.reset();
          showToast("New offer published to the live feed.");
        })
        .catch(function(err){
          showToast(err.message === "auth" ? "Please log in again to publish offers." : "Could not publish offer.");
        });
      });
    }
  }

  document.addEventListener("DOMContentLoaded", function(){
    var yearEl = document.getElementById("year");
    if(yearEl) yearEl.textContent = new Date().getFullYear();

    initOffersStream();
    buildTicker();
    initReveal();
    initMobileMenu();
    markActiveNav();
    initContactForm();
    initBuyerOfferForm();
    initAdmin();
  });

})();
