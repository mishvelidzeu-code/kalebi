$style = @'
  <style>
    :root {
      --bg: #fff7fb;
      --card: rgba(255, 255, 255, 0.9);
      --text: #2b1720;
      --muted: #765465;
      --line: rgba(224, 62, 92, 0.16);
      --primary: #e94560;
      --primary-dark: #c12d49;
      --success: #18794e;
      --warning: #9a3412;
      --shadow: 0 26px 70px rgba(224, 62, 92, 0.16);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Noto Sans Georgian", "Segoe UI", Arial, sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at 10% 0%, rgba(255, 191, 210, 0.55), transparent 30%),
        linear-gradient(150deg, #ffffff 0%, var(--bg) 56%, #ffe7f0 100%);
    }
    .page { width: min(1120px, calc(100% - 32px)); margin: 0 auto; padding: 34px 0 54px; }
    .hero { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(320px, 420px); gap: 26px; align-items: start; }
    .panel { background: var(--card); border: 1px solid rgba(255, 255, 255, 0.92); border-radius: 28px; box-shadow: var(--shadow); backdrop-filter: blur(18px); }
    .intro, .checkout, .contract { padding: 28px; }
    .brand { display: inline-flex; align-items: center; gap: 12px; padding: 9px 15px 9px 9px; border-radius: 999px; background: rgba(255, 255, 255, 0.78); border: 1px solid rgba(255, 255, 255, 0.9); }
    .brand img { width: 52px; height: 52px; border-radius: 16px; }
    .brand-name { color: var(--primary); font-size: 18px; font-weight: 900; }
    h1 { margin: 24px 0 14px; font-size: clamp(34px, 5vw, 58px); line-height: 1.05; font-weight: 900; }
    p { color: var(--muted); line-height: 1.7; }
    .lead { max-width: 60ch; font-size: 18px; font-weight: 600; }
    .facts { display: grid; gap: 12px; margin-top: 22px; }
    .fact { display: grid; grid-template-columns: 36px 1fr; gap: 12px; padding: 14px; border-radius: 18px; background: rgba(255, 255, 255, 0.76); border: 1px solid var(--line); }
    .num { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 12px; background: rgba(233, 69, 96, 0.1); color: var(--primary); font-weight: 900; }
    .fact strong { display: block; margin-bottom: 4px; }
    .fact span { color: var(--muted); font-size: 14px; line-height: 1.55; }
    .checkout { position: sticky; top: 22px; }
    .eyebrow { display: inline-flex; padding: 8px 12px; border-radius: 999px; background: rgba(233, 69, 96, 0.1); color: var(--primary); font-size: 12px; font-weight: 900; letter-spacing: 0.04em; text-transform: uppercase; }
    h2 { margin: 16px 0 8px; font-size: 25px; }
    .user-box, .status-box { margin-top: 16px; padding: 14px; border-radius: 16px; background: rgba(255, 255, 255, 0.84); border: 1px solid var(--line); }
    .label { display: block; margin-bottom: 6px; color: var(--muted); font-size: 12px; font-weight: 900; text-transform: uppercase; }
    .user-id { word-break: break-all; font-family: Consolas, "Courier New", monospace; font-size: 14px; }
    .status-box { display: none; }
    .status-box.visible { display: block; }
    .status-box.success { color: var(--success); background: rgba(236, 253, 245, 0.92); }
    .status-box.error { color: var(--warning); background: rgba(255, 247, 237, 0.94); }
    .plans { display: grid; gap: 12px; margin-top: 16px; }
    .plan { width: 100%; text-align: left; padding: 17px; border-radius: 20px; border: 1px solid var(--line); background: rgba(255, 255, 255, 0.9); cursor: pointer; }
    .plan.selected { border-color: var(--primary); box-shadow: 0 18px 34px rgba(233, 69, 96, 0.16); }
    .plan-top { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
    .plan-name { font-size: 18px; font-weight: 900; }
    .badge { padding: 7px 10px; border-radius: 999px; background: rgba(233, 69, 96, 0.1); color: var(--primary); font-size: 11px; font-weight: 900; }
    .price { margin-top: 10px; font-size: 30px; font-weight: 900; }
    .sub { margin-top: 6px; color: var(--muted); font-size: 14px; line-height: 1.55; }
    .checkout-button { width: 100%; margin-top: 18px; padding: 17px 18px; border: 0; border-radius: 20px; background: linear-gradient(135deg, var(--primary), var(--primary-dark)); color: white; font-size: 16px; font-weight: 900; cursor: pointer; }
    .checkout-button:disabled { opacity: 0.6; cursor: wait; }
    .micro { margin: 13px 4px 0; color: var(--muted); font-size: 12px; }
    .contracts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; margin-top: 26px; }
    pre { margin: 0; padding: 16px; overflow: auto; border-radius: 16px; background: #24131a; color: #fff4f8; font-size: 12px; line-height: 1.55; }
    code { font-family: Consolas, "Courier New", monospace; }
    @media (max-width: 900px) { .hero, .contracts { grid-template-columns: 1fr; } .checkout { position: static; } }
    @media (max-width: 560px) { .page { width: min(100% - 20px, 100%); padding-top: 16px; } .intro, .checkout, .contract { padding: 20px; } h1 { font-size: 34px; } .lead { font-size: 16px; } }
  </style>
'@

$sharedScript = @'
  <script>
    const config = window.CYCLE_CARE_PAYMENT_CONFIG;
    const params = new URLSearchParams(window.location.search);
    const userId = params.get("user_id") || "";
    const status = params.get("status") || "";
    const checkoutButton = document.getElementById("checkoutButton");
    const userIdValue = document.getElementById("userIdValue");
    const statusBox = document.getElementById("statusBox");
    const planList = document.getElementById("planList");
    const requestContract = document.getElementById("requestContract");
    const writeContract = document.getElementById("writeContract");
    let selectedPlanId = config.plans[0] ? config.plans[0].id : "";
    let isSubmitting = false;
    function showStatus(message, type) { statusBox.innerHTML = message; statusBox.className = "status-box visible " + type; }
    function buildStatusUrl(nextStatus) { return window.location.origin + window.location.pathname + "?status=" + encodeURIComponent(nextStatus) + "&user_id=" + encodeURIComponent(userId); }
    function buildRequestPayload() { return { app: "cycle_care", source: config.source, product_key: config.productKey, user_id: userId, plan: selectedPlanId, currency: config.currency, success_url: buildStatusUrl(config.successStatus), cancel_url: buildStatusUrl(config.cancelStatus) }; }
    function renderUserId() {
      if (userId) { userIdValue.textContent = userId; return; }
      userIdValue.innerHTML = "user_id &#x10D5;&#x10D4;&#x10E0; &#x10DB;&#x10DD;&#x10D8;&#x10EB;&#x10D4;&#x10D1;&#x10DC;&#x10D0; URL-&#x10E8;&#x10D8;";
      showStatus("Checkout-&#x10D8;&#x10E1;&#x10D7;&#x10D5;&#x10D8;&#x10E1; &#x10D0;&#x10E3;&#x10EA;&#x10D8;&#x10DA;&#x10D4;&#x10D1;&#x10D4;&#x10DA;&#x10D8;&#x10D0; URL query param: user_id", "error");
    }
    function renderPlans() {
      planList.innerHTML = "";
      config.plans.forEach((plan) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "plan" + (plan.id === selectedPlanId ? " selected" : "");
        button.innerHTML = '<div class="plan-top"><div class="plan-name">' + plan.title + '</div><div class="badge">' + plan.badge + '</div></div><div class="price">' + plan.priceLabel + '</div><div class="sub">' + plan.subtitle + '</div>';
        button.addEventListener("click", () => { selectedPlanId = plan.id; renderPlans(); renderContracts(); });
        planList.appendChild(button);
      });
    }
    function renderContracts() {
      requestContract.textContent = JSON.stringify({ endpoint: config.checkoutEndpoint || config.exampleEndpoint, method: "POST", body: buildRequestPayload(), expected_response: { checkout_url: "https://payment-provider.example/checkout-session", order_id: "provider-order-id" } }, null, 2);
      writeContract.textContent = JSON.stringify(config.writeContract(selectedPlanId, userId || "<supabase-user-id>"), null, 2);
    }
    function setSubmitting(nextValue) { isSubmitting = nextValue; checkoutButton.disabled = nextValue; checkoutButton.innerHTML = nextValue ? "&#x10D8;&#x10E2;&#x10D5;&#x10D8;&#x10E0;&#x10D7;&#x10D4;&#x10D1;&#x10D0;..." : "&#x10D2;&#x10D0;&#x10D2;&#x10E0;&#x10EB;&#x10D4;&#x10DA;&#x10D4;&#x10D1;&#x10D0; &#x10D2;&#x10D0;&#x10D3;&#x10D0;&#x10EE;&#x10D3;&#x10D0;&#x10D6;&#x10D4;"; }
    async function startCheckout() {
      if (isSubmitting) { return; }
      if (!userId) { showStatus("Checkout &#x10D5;&#x10D4;&#x10E0; &#x10D2;&#x10D0;&#x10D4;&#x10E8;&#x10D5;&#x10D0;, user_id &#x10D0;&#x10D9;&#x10DA;&#x10D8;&#x10D0;.", "error"); return; }
      if (!config.checkoutEndpoint) { showStatus("checkoutEndpoint &#x10EF;&#x10D4;&#x10E0; &#x10D0;&#x10E0; &#x10D0;&#x10E0;&#x10D8;&#x10E1; &#x10DB;&#x10D8;&#x10D7;&#x10D8;&#x10D7;&#x10D4;&#x10D1;&#x10E3;&#x10DA;&#x10D8;.", "error"); return; }
      setSubmitting(true);
      try {
        const response = await fetch(config.checkoutEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildRequestPayload()) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) { throw new Error(data.error || "checkout_request_failed"); }
        if (!data.checkout_url) { throw new Error("missing_checkout_url"); }
        if (data.order_id) { sessionStorage.setItem("cycle-care-last-order-id", data.order_id); }
        window.location.href = data.checkout_url;
      } catch (error) {
        showStatus("&#x10D2;&#x10D0;&#x10D3;&#x10D0;&#x10EE;&#x10D3;&#x10D8;&#x10E1; &#x10D2;&#x10D5;&#x10D4;&#x10E0;&#x10D3;&#x10D8; &#x10D5;&#x10D4;&#x10E0; &#x10E8;&#x10D4;&#x10D8;&#x10E5;&#x10DB;&#x10DC;&#x10D0;: " + (error.message || "unknown_error"), "error");
        setSubmitting(false);
      }
    }
    checkoutButton.addEventListener("click", startCheckout);
    if (status === config.successStatus) { showStatus(config.successMessage, "success"); }
    else if (status === config.cancelStatus) { showStatus("&#x10D2;&#x10D0;&#x10D3;&#x10D0;&#x10EE;&#x10D3;&#x10D0; &#x10D2;&#x10D0;&#x10E3;&#x10E5;&#x10DB;&#x10D3;&#x10D0;.", "error"); }
    renderUserId();
    renderPlans();
    renderContracts();
  </script>
'@

$primeHtml = @"
<!DOCTYPE html>
<html lang="ka">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cycle Care Prime Checkout</title>
  <link rel="icon" href="qalis.png" />
$style
</head>
<body>
  <main class="page">
    <section class="hero">
      <div class="panel intro">
        <div class="brand"><img src="qalis.png" alt="Cycle Care icon" /><div class="brand-name">Cycle Care Prime</div></div>
        <h1>Android Prime &#x10D2;&#x10D0;&#x10D3;&#x10D0;&#x10EE;&#x10D3;&#x10D0;</h1>
        <p class="lead">Android &#x10D0;&#x10DE;&#x10D8;&#x10E1;&#x10D7;&#x10D5;&#x10D8;&#x10E1;. iOS &#x10E3;&#x10EA;&#x10D5;&#x10DA;&#x10D4;&#x10DA;&#x10D8;&#x10D0;. &#x10EC;&#x10D0;&#x10E0;&#x10DB;&#x10D0;&#x10E2;&#x10D4;&#x10D1;&#x10E3;&#x10DA;&#x10D8; &#x10D2;&#x10D0;&#x10D3;&#x10D0;&#x10EE;&#x10D3;&#x10D8;&#x10E1; &#x10E8;&#x10D4;&#x10DB;&#x10D3;&#x10D4;&#x10D2; backend &#x10D0;&#x10D0;&#x10EE;&#x10DA;&#x10D4;&#x10D1;&#x10E1; <code>profiles.is_premium</code> &#x10D3;&#x10D0; <code>profiles.premium_until</code>.</p>
        <div class="facts">
          <div class="fact"><div class="num">1</div><div><strong>iOS &#x10E3;&#x10EA;&#x10D5;&#x10DA;&#x10D4;&#x10DA;&#x10D8;&#x10D0;</strong><span>Apple/RevenueCat flow &#x10D0;&#x10DB; &#x10D2;&#x10D5;&#x10D4;&#x10E0;&#x10D3;&#x10E1; &#x10D0;&#x10E0; &#x10D8;&#x10E7;&#x10D4;&#x10DC;&#x10D4;&#x10D1;&#x10E1;.</span></div></div>
          <div class="fact"><div class="num">2</div><div><strong>Android web checkout</strong><span>&#x10D0;&#x10DE;&#x10D8; &#x10D3;&#x10D0;&#x10D1;&#x10E0;&#x10E3;&#x10DC;&#x10D4;&#x10D1;&#x10D8;&#x10E1;&#x10D0;&#x10E1; Supabase-&#x10D3;&#x10D0;&#x10DC; refresh-&#x10E1; &#x10D0;&#x10D9;&#x10D4;&#x10D7;&#x10D4;&#x10D1;&#x10E1;.</span></div></div>
        </div>
      </div>
      <aside class="panel checkout">
        <div class="eyebrow">Android Web Payment</div>
        <h2>&#x10D0;&#x10D8;&#x10E0;&#x10E9;&#x10D8;&#x10D4; Prime &#x10D2;&#x10D4;&#x10D2;&#x10DB;&#x10D0;</h2>
        <p>Checkout request backend-&#x10D6;&#x10D4; &#x10D8;&#x10D2;&#x10D6;&#x10D0;&#x10D5;&#x10DC;&#x10D4;&#x10D1;&#x10D0;.</p>
        <div class="user-box"><span class="label">Supabase User ID</span><div id="userIdValue" class="user-id">&#x10D8;&#x10E2;&#x10D5;&#x10D8;&#x10E0;&#x10D7;&#x10D4;&#x10D1;&#x10D0;...</div></div>
        <div id="statusBox" class="status-box" role="status" aria-live="polite"></div>
        <div class="plans" id="planList"></div>
        <button id="checkoutButton" class="checkout-button" type="button">&#x10D2;&#x10D0;&#x10D2;&#x10E0;&#x10EB;&#x10D4;&#x10DA;&#x10D4;&#x10D1;&#x10D0; &#x10D2;&#x10D0;&#x10D3;&#x10D0;&#x10EE;&#x10D3;&#x10D0;&#x10D6;&#x10D4;</button>
        <p class="micro">URL-&#x10E8;&#x10D8; <code>user_id</code> &#x10E1;&#x10D0;&#x10ED;&#x10D8;&#x10E0;&#x10DD;&#x10D0;.</p>
      </aside>
    </section>
    <section class="contracts">
      <article class="panel contract"><h2>Checkout request</h2><p>Backend contract checkout session-&#x10D8;&#x10E1;&#x10D7;&#x10D5;&#x10D8;&#x10E1;.</p><pre id="requestContract"></pre></article>
      <article class="panel contract"><h2>Payment write</h2><p>&#x10EC;&#x10D0;&#x10E0;&#x10DB;&#x10D0;&#x10E2;&#x10D4;&#x10D1;&#x10E3;&#x10DA;&#x10D8; &#x10D2;&#x10D0;&#x10D3;&#x10D0;&#x10EE;&#x10D3;&#x10D8;&#x10E1; &#x10E9;&#x10D0;&#x10E1;&#x10D0;&#x10EC;&#x10D4;&#x10E0;&#x10D8; &#x10D5;&#x10D4;&#x10DA;&#x10D4;&#x10D1;&#x10D8;.</p><pre id="writeContract"></pre></article>
    </section>
  </main>
  <script>
    window.CYCLE_CARE_PAYMENT_CONFIG = {
      checkoutEndpoint: "",
      exampleEndpoint: "https://YOUR_BACKEND/checkout/cycle-care/prime",
      currency: "GEL",
      productKey: "prime",
      source: "android_web",
      successStatus: "success",
      cancelStatus: "cancelled",
      successMessage: "&#x10D2;&#x10D0;&#x10D3;&#x10D0;&#x10EE;&#x10D3;&#x10D0; &#x10D3;&#x10D0;&#x10E1;&#x10E0;&#x10E3;&#x10DA;&#x10D3;&#x10D0;. Backend &#x10D0;&#x10D0;&#x10EE;&#x10DA;&#x10D4;&#x10D1;&#x10E1; Prime access-&#x10E1;.",
      plans: [
        { id: "1_month", title: "1 &#x10D7;&#x10D5;&#x10D4;", priceLabel: "9.99 GEL", subtitle: "Prime &#x10EC;&#x10D5;&#x10D3;&#x10DD;&#x10DB;&#x10D0; &#x10D4;&#x10E0;&#x10D7;&#x10D8; &#x10D7;&#x10D5;&#x10D8;&#x10D7;", badge: "Prime" },
        { id: "3_months", title: "3 &#x10D7;&#x10D5;&#x10D4;", priceLabel: "24.99 GEL", subtitle: "Prime &#x10EC;&#x10D5;&#x10D3;&#x10DD;&#x10DB;&#x10D0; &#x10E1;&#x10D0;&#x10DB;&#x10D8; &#x10D7;&#x10D5;&#x10D8;&#x10D7;", badge: "Popular" },
        { id: "12_months", title: "12 &#x10D7;&#x10D5;&#x10D4;", priceLabel: "79.99 GEL", subtitle: "Prime &#x10EC;&#x10D5;&#x10D3;&#x10DD;&#x10DB;&#x10D0; &#x10D4;&#x10E0;&#x10D7;&#x10D8; &#x10EC;&#x10DA;&#x10D8;&#x10D7;", badge: "Best value" }
      ],
      writeContract: (selectedPlanId, userId) => ({ table: "public.profiles", match: { id: userId }, update: { is_premium: true, premium_until: "calculated_from_base_time_plus_plan_interval", premium_plan: selectedPlanId, premium_source: "android_web", premium_last_payment_at: "payment_confirmed_at", premium_order_id: "provider-order-id" }, also_insert: { table: "public.billing_entitlements", product_key: "prime", platform: "android", source: "android_web", status: "active" } })
    };
  </script>
$sharedScript
</body>
</html>
"@

$pregnancyHtml = @"
<!DOCTYPE html>
<html lang="ka">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cycle Care Pregnancy Checkout</title>
  <link rel="icon" href="qalis.png" />
$style
</head>
<body>
  <main class="page">
    <section class="hero">
      <div class="panel intro">
        <div class="brand"><img src="qalis.png" alt="Cycle Care icon" /><div class="brand-name">Cycle Care Pregnancy</div></div>
        <h1>&#x10DD;&#x10E0;&#x10E1;&#x10E3;&#x10DA;&#x10DD;&#x10D1;&#x10D8;&#x10E1; &#x10E0;&#x10D4;&#x10DF;&#x10D8;&#x10DB;&#x10D8;&#x10E1; &#x10D2;&#x10D0;&#x10D3;&#x10D0;&#x10EE;&#x10D3;&#x10D0;</h1>
        <p class="lead">Android &#x10D0;&#x10DE;&#x10D8;&#x10E1;&#x10D7;&#x10D5;&#x10D8;&#x10E1;. iOS &#x10E3;&#x10EA;&#x10D5;&#x10DA;&#x10D4;&#x10DA;&#x10D8;&#x10D0;. &#x10EC;&#x10D0;&#x10E0;&#x10DB;&#x10D0;&#x10E2;&#x10D4;&#x10D1;&#x10E3;&#x10DA;&#x10D8; &#x10D2;&#x10D0;&#x10D3;&#x10D0;&#x10EE;&#x10D3;&#x10D8;&#x10E1; &#x10E8;&#x10D4;&#x10DB;&#x10D3;&#x10D4;&#x10D2; backend &#x10D0;&#x10D0;&#x10EE;&#x10DA;&#x10D4;&#x10D1;&#x10E1; <code>profiles.has_pregnancy_subscription</code> &#x10D3;&#x10D0; <code>profiles.pregnancy_until</code>.</p>
        <div class="facts">
          <div class="fact"><div class="num">1</div><div><strong>Pregnancy access</strong><span>&#x10D0;&#x10E5; &#x10D8;&#x10EC;&#x10D4;&#x10E0;&#x10D4;&#x10D1;&#x10D0; pregnancy-specific access &#x10D3;&#x10D0; billing history.</span></div></div>
          <div class="fact"><div class="num">2</div><div><strong>Android refresh</strong><span>&#x10D0;&#x10DE;&#x10D8; &#x10D3;&#x10D0;&#x10D1;&#x10E0;&#x10E3;&#x10DC;&#x10D4;&#x10D1;&#x10D8;&#x10E1;&#x10D0;&#x10E1; Supabase-&#x10D3;&#x10D0;&#x10DC; refresh-&#x10E1; &#x10D0;&#x10D9;&#x10D4;&#x10D7;&#x10D4;&#x10D1;&#x10E1;.</span></div></div>
        </div>
      </div>
      <aside class="panel checkout">
        <div class="eyebrow">Android Web Payment</div>
        <h2>&#x10DD;&#x10E0;&#x10E1;&#x10E3;&#x10DA;&#x10DD;&#x10D1;&#x10D8;&#x10E1; &#x10E0;&#x10D4;&#x10DF;&#x10D8;&#x10DB;&#x10D8;</h2>
        <p>Checkout request backend-&#x10D6;&#x10D4; &#x10D8;&#x10D2;&#x10D6;&#x10D0;&#x10D5;&#x10DC;&#x10D4;&#x10D1;&#x10D0;.</p>
        <div class="user-box"><span class="label">Supabase User ID</span><div id="userIdValue" class="user-id">&#x10D8;&#x10E2;&#x10D5;&#x10D8;&#x10E0;&#x10D7;&#x10D4;&#x10D1;&#x10D0;...</div></div>
        <div id="statusBox" class="status-box" role="status" aria-live="polite"></div>
        <div class="plans" id="planList"></div>
        <button id="checkoutButton" class="checkout-button" type="button">&#x10D2;&#x10D0;&#x10D2;&#x10E0;&#x10EB;&#x10D4;&#x10DA;&#x10D4;&#x10D1;&#x10D0; &#x10D2;&#x10D0;&#x10D3;&#x10D0;&#x10EE;&#x10D3;&#x10D0;&#x10D6;&#x10D4;</button>
        <p class="micro">URL-&#x10E8;&#x10D8; <code>user_id</code> &#x10E1;&#x10D0;&#x10ED;&#x10D8;&#x10E0;&#x10DD;&#x10D0;.</p>
      </aside>
    </section>
    <section class="contracts">
      <article class="panel contract"><h2>Checkout request</h2><p>Backend contract pregnancy checkout session-&#x10D8;&#x10E1;&#x10D7;&#x10D5;&#x10D8;&#x10E1;.</p><pre id="requestContract"></pre></article>
      <article class="panel contract"><h2>Payment write</h2><p>&#x10EC;&#x10D0;&#x10E0;&#x10DB;&#x10D0;&#x10E2;&#x10D4;&#x10D1;&#x10E3;&#x10DA;&#x10D8; &#x10D2;&#x10D0;&#x10D3;&#x10D0;&#x10EE;&#x10D3;&#x10D8;&#x10E1; &#x10E9;&#x10D0;&#x10E1;&#x10D0;&#x10EC;&#x10D4;&#x10E0;&#x10D8; &#x10D5;&#x10D4;&#x10DA;&#x10D4;&#x10D1;&#x10D8;.</p><pre id="writeContract"></pre></article>
    </section>
  </main>
  <script>
    window.CYCLE_CARE_PAYMENT_CONFIG = {
      checkoutEndpoint: "",
      exampleEndpoint: "https://YOUR_BACKEND/checkout/cycle-care/pregnancy",
      currency: "GEL",
      productKey: "pregnancy",
      source: "android_web",
      successStatus: "success",
      cancelStatus: "cancelled",
      successMessage: "&#x10D2;&#x10D0;&#x10D3;&#x10D0;&#x10EE;&#x10D3;&#x10D0; &#x10D3;&#x10D0;&#x10E1;&#x10E0;&#x10E3;&#x10DA;&#x10D3;&#x10D0;. Backend &#x10D0;&#x10D0;&#x10EE;&#x10DA;&#x10D4;&#x10D1;&#x10E1; pregnancy access-&#x10E1;.",
      plans: [
        { id: "1_month", title: "1 &#x10D7;&#x10D5;&#x10D4;", priceLabel: "9.99 GEL", subtitle: "&#x10DD;&#x10E0;&#x10E1;&#x10E3;&#x10DA;&#x10DD;&#x10D1;&#x10D8;&#x10E1; &#x10E0;&#x10D4;&#x10DF;&#x10D8;&#x10DB;&#x10D8; &#x10D4;&#x10E0;&#x10D7;&#x10D8; &#x10D7;&#x10D5;&#x10D8;&#x10D7;", badge: "Pregnancy" }
      ],
      writeContract: (selectedPlanId, userId) => ({ table: "public.profiles", match: { id: userId }, update: { has_pregnancy_subscription: true, pregnancy_until: "optional_if_subscription_model_else_null", pregnancy_plan: selectedPlanId, pregnancy_source: "android_web", pregnancy_last_payment_at: "payment_confirmed_at", pregnancy_order_id: "provider-order-id" }, also_insert: { table: "public.billing_entitlements", product_key: "pregnancy", platform: "android", source: "android_web", status: "active" } })
    };
  </script>
$sharedScript
</body>
</html>
"@

Set-Content -LiteralPath 'C:\Users\ASUS\Desktop\football\qalis_Sivrce_prime.html' -Value $primeHtml -Encoding UTF8
Set-Content -LiteralPath 'C:\Users\ASUS\Desktop\football\qalis_sivrce.html' -Value $pregnancyHtml -Encoding UTF8
