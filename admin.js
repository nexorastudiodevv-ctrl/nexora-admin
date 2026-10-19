import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { adminEmail, firebaseConfig } from "./firebase-config.js";

const elements = {
  notice: document.querySelector("[data-notice]"),
  loginPanel: document.querySelector("[data-login-panel]"),
  loginForm: document.querySelector("[data-login-form]"),
  adminPanel: document.querySelector("[data-admin-panel]"),
  userEmail: document.querySelector("[data-user-email]"),
  articleForm: document.querySelector("[data-article-form]"),
  articleFormTitle: document.querySelector("[data-article-form-title]"),
  articleList: document.querySelector("[data-article-list]"),
  articleOffers: document.querySelector("[data-article-offers]"),
  offerForm: document.querySelector("[data-offer-form]"),
  offerFormTitle: document.querySelector("[data-offer-form-title]"),
  offerList: document.querySelector("[data-offer-list]"),
};

const categories = {
  ai: "الذكاء الاصطناعي",
  programming: "البرمجة والتطوير",
  pdf: "ملفات PDF",
  wifi: "Wi-Fi والشبكات",
  "quran-hadith": "القرآن والحديث",
  "android-safety": "أمان تطبيقات Android",
  shopping: "التسوق والعروض",
};

const isConfigured = Object.values(firebaseConfig).every(
  (value) => value && !value.startsWith("REPLACE_WITH"),
);

function showNotice(message, kind = "error") {
  elements.notice.textContent = message;
  elements.notice.dataset.kind = kind;
  elements.notice.hidden = false;
}

function errorMessage(error) {
  if (error.code === "permission-denied" || error.code === "auth/unauthorized-domain") {
    return "تعذّر الوصول. تحقّق من صلاحيات Firestore والنطاقات المسموح بها في Firebase Authentication.";
  }
  if (error.code === "auth/invalid-credential" || error.code === "auth/invalid-login-credentials") {
    return "بيانات الدخول غير صحيحة، أو لم يتم تفعيل حساب المدير.";
  }
  if (error.code === "auth/network-request-failed") {
    return "تعذّر الاتصال. تحقّق من اتصال الإنترنت وإعدادات Firebase.";
  }
  return `تعذّرت العملية: ${error.message || "حدث خطأ غير متوقع."}`;
}

function setFormValue(form, name, value) {
  const field = form.elements.namedItem(name);
  if (field.type === "checkbox") field.checked = Boolean(value);
  else field.value = value ?? "";
}

function resetArticleForm() {
  elements.articleForm.reset();
  setFormValue(elements.articleForm, "id", "");
  setFormValue(elements.articleForm, "publishedAt", new Date().toISOString().slice(0, 10));
  elements.articleFormTitle.textContent = "مقال جديد";
  elements.articleForm.hidden = true;
}

function resetOfferForm() {
  elements.offerForm.reset();
  setFormValue(elements.offerForm, "id", "");
  elements.offerFormTitle.textContent = "عرض جديد";
  elements.offerForm.hidden = true;
}

function addRecordActions(container, id, editHandler, collectionName) {
  const actions = document.createElement("div");
  actions.className = "record-actions";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.textContent = "تعديل";
  editButton.addEventListener("click", editHandler);
  actions.append(editButton);

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "delete-button";
  deleteButton.textContent = "حذف";
  deleteButton.addEventListener("click", async () => {
    if (!window.confirm("هل تريد حذف هذا العنصر نهائيًا؟")) return;
    deleteButton.disabled = true;
    try {
      await deleteDoc(doc(database, collectionName, id));
      await refreshData();
      showNotice("تم الحذف.", "success");
    } catch (error) {
      deleteButton.disabled = false;
      showNotice(errorMessage(error));
    }
  });
  actions.append(deleteButton);
  container.append(actions);
}

let database;
let articles = [];
let offers = [];

function renderArticles() {
  elements.articleList.replaceChildren();
  if (articles.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "لا توجد مقالات محفوظة بعد.";
    elements.articleList.append(empty);
    return;
  }

  articles.forEach((article) => {
    const record = document.createElement("article");
    record.className = "record";
    const details = document.createElement("div");
    const title = document.createElement("h4");
    title.textContent = article.title;
    const metadata = document.createElement("p");
    metadata.textContent = `${categories[article.category] || article.category} · ${article.status === "published" ? "منشور" : "مسودة"} · ${article.slug}`;
    details.append(title, metadata);
    record.append(details);
    addRecordActions(record, article.id, () => openArticleEditor(article), "articles");
    elements.articleList.append(record);
  });
}

function renderOffers() {
  const selectedOfferIds = [...elements.articleOffers.querySelectorAll('input[name="offerIds"]:checked')]
    .map((checkbox) => checkbox.value);
  elements.offerList.replaceChildren();
  if (offers.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "لا توجد عروض محفوظة بعد.";
    elements.offerList.append(empty);
  } else {
    offers.forEach((offer) => {
      const record = document.createElement("article");
      record.className = "record";
      const details = document.createElement("div");
      const title = document.createElement("h4");
      title.textContent = `${offer.partner} — ${offer.product}`;
      const metadata = document.createElement("p");
      metadata.textContent = `${offer.commissionRate}% عمولة · ${offer.status === "published" ? "منشور" : "مسودة"}`;
      details.append(title, metadata);
      record.append(details);
      addRecordActions(record, offer.id, () => openOfferEditor(offer), "affiliateOffers");
      elements.offerList.append(record);
    });
  }
  renderOfferCheckboxes(selectedOfferIds);
}

function renderOfferCheckboxes(selectedIds = []) {
  elements.articleOffers.replaceChildren();
  const availableOffers = offers.filter((offer) => offer.status === "published");
  if (availableOffers.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "أضف عرضًا منشورًا من قسم عروض العمولة أولًا.";
    elements.articleOffers.append(empty);
    return;
  }
  availableOffers.forEach((offer) => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "offerIds";
    checkbox.value = offer.id;
    checkbox.checked = selectedIds.includes(offer.id);
    const text = document.createElement("span");
    text.textContent = `${offer.partner} — ${offer.product}`;
    label.append(checkbox, text);
    elements.articleOffers.append(label);
  });
}

async function refreshData() {
  const [articleSnapshot, offerSnapshot] = await Promise.all([
    getDocs(collection(database, "articles")),
    getDocs(collection(database, "affiliateOffers")),
  ]);
  articles = articleSnapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((first, second) => (second.updatedAt?.seconds || 0) - (first.updatedAt?.seconds || 0));
  offers = offerSnapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((first, second) => first.partner.localeCompare(second.partner));
  renderArticles();
  renderOffers();
}

function openArticleEditor(article = null) {
  elements.articleForm.reset();
  elements.articleFormTitle.textContent = article ? "تعديل المقال" : "مقال جديد";
  setFormValue(elements.articleForm, "id", article?.id);
  setFormValue(elements.articleForm, "title", article?.title);
  setFormValue(elements.articleForm, "slug", article?.slug);
  setFormValue(elements.articleForm, "category", article?.category || "ai");
  setFormValue(elements.articleForm, "excerpt", article?.excerpt);
  setFormValue(elements.articleForm, "content", article?.content);
  setFormValue(elements.articleForm, "publishedAt", article?.publishedAt || new Date().toISOString().slice(0, 10));
  setFormValue(elements.articleForm, "isPublished", article?.status === "published");
  renderOfferCheckboxes(article?.offerIds || []);
  elements.articleForm.hidden = false;
  elements.articleForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openOfferEditor(offer = null) {
  elements.offerForm.reset();
  elements.offerFormTitle.textContent = offer ? "تعديل العرض" : "عرض جديد";
  setFormValue(elements.offerForm, "id", offer?.id);
  setFormValue(elements.offerForm, "partner", offer?.partner);
  setFormValue(elements.offerForm, "product", offer?.product);
  setFormValue(elements.offerForm, "url", offer?.url);
  setFormValue(elements.offerForm, "commissionRate", offer?.commissionRate);
  setFormValue(elements.offerForm, "discountCode", offer?.discountCode);
  setFormValue(elements.offerForm, "description", offer?.description);
  setFormValue(elements.offerForm, "imageUrl", offer?.imageUrl);
  setFormValue(elements.offerForm, "isPublished", offer?.status === "published");
  elements.offerForm.hidden = false;
  elements.offerForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function collectOfferIds() {
  return [...elements.articleForm.querySelectorAll('input[name="offerIds"]:checked')]
    .map((checkbox) => checkbox.value);
}

if (!isConfigured || !adminEmail) {
  elements.loginForm.hidden = true;
  showNotice("تحقّق من إعدادات Firebase وبريد المدير في firebase-config.js.");
} else {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  database = getFirestore(app);

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      elements.loginPanel.hidden = false;
      elements.adminPanel.hidden = true;
      return;
    }
    if (user.email?.toLowerCase() !== adminEmail.toLowerCase()) {
      try {
        await signOut(auth);
        showNotice("هذا البريد غير مخوّل لإدارة الموقع.");
      } catch (error) {
        showNotice(errorMessage(error));
      }
      return;
    }
    if (!user.emailVerified) {
      elements.loginPanel.hidden = false;
      elements.adminPanel.hidden = true;
      try {
        await sendEmailVerification(user);
        await signOut(auth);
        showNotice("أرسلنا رابط تأكيد إلى بريد المدير. افتح الرسالة وأكّد البريد، ثم سجّل الدخول مجددًا.", "success");
      } catch (error) {
        showNotice(errorMessage(error));
      }
      return;
    }

    elements.loginPanel.hidden = true;
    elements.adminPanel.hidden = false;
    elements.userEmail.textContent = user.email || "";
    try {
      await refreshData();
    } catch (error) {
      showNotice(errorMessage(error));
    }
  });

  elements.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = elements.loginForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const formData = new FormData(elements.loginForm);
      await signInWithEmailAndPassword(auth, formData.get("email"), formData.get("password"));
      elements.loginForm.reset();
      elements.notice.hidden = true;
    } catch (error) {
      showNotice(errorMessage(error));
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector("[data-sign-out]").addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (error) {
      showNotice(errorMessage(error));
    }
  });

  elements.articleForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = elements.articleForm.querySelector('button[type="submit"]');
    const formData = new FormData(elements.articleForm);
    const slug = String(formData.get("slug")).trim();
    const existingId = String(formData.get("id"));
    if (existingId && existingId !== slug) {
      showNotice("لا يمكن تغيير الرابط المختصر بعد إنشاء المقال. أنشئ مقالًا جديدًا إذا أردت رابطًا مختلفًا.");
      return;
    }
    button.disabled = true;
    try {
      const article = {
        title: String(formData.get("title")).trim(),
        slug,
        category: String(formData.get("category")),
        excerpt: String(formData.get("excerpt")).trim(),
        content: String(formData.get("content")).trim(),
        publishedAt: String(formData.get("publishedAt")),
        offerIds: collectOfferIds(),
        status: formData.get("isPublished") ? "published" : "draft",
        updatedAt: serverTimestamp(),
      };
      if (article.status === "published") article.publishedAt ||= new Date().toISOString().slice(0, 10);
      await setDoc(doc(database, "articles", slug), article);
      resetArticleForm();
      await refreshData();
      showNotice("تم حفظ المقال.", "success");
    } catch (error) {
      showNotice(errorMessage(error));
    } finally {
      button.disabled = false;
    }
  });

  elements.offerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = elements.offerForm.querySelector('button[type="submit"]');
    const formData = new FormData(elements.offerForm);
    const id = String(formData.get("id"));
    const url = String(formData.get("url")).trim();
    const imageUrl = String(formData.get("imageUrl")).trim();
    if (!["http:", "https:"].includes(new URL(url).protocol)
      || (imageUrl && !["http:", "https:"].includes(new URL(imageUrl).protocol))) {
      showNotice("يجب أن تبدأ روابط العرض والصورة بـ http:// أو https://.");
      return;
    }
    button.disabled = true;
    try {
      const offer = {
        partner: String(formData.get("partner")).trim(),
        product: String(formData.get("product")).trim(),
        url,
        commissionRate: Number(formData.get("commissionRate")),
        discountCode: String(formData.get("discountCode")).trim(),
        description: String(formData.get("description")).trim(),
        imageUrl,
        status: formData.get("isPublished") ? "published" : "draft",
        updatedAt: serverTimestamp(),
      };
      if (id) await setDoc(doc(database, "affiliateOffers", id), offer);
      else await addDoc(collection(database, "affiliateOffers"), offer);
      resetOfferForm();
      await refreshData();
      showNotice("تم حفظ العرض.", "success");
    } catch (error) {
      showNotice(errorMessage(error));
    } finally {
      button.disabled = false;
    }
  });
}

document.querySelector("[data-new-article]").addEventListener("click", () => openArticleEditor());
document.querySelector("[data-cancel-article]").addEventListener("click", resetArticleForm);
document.querySelector("[data-new-offer]").addEventListener("click", () => openOfferEditor());
document.querySelector("[data-cancel-offer]").addEventListener("click", resetOfferForm);

document.querySelectorAll("[data-tab]").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("[data-tab]").forEach((item) => {
      const isActive = item === tab;
      item.classList.toggle("is-active", isActive);
      item.setAttribute("aria-selected", String(isActive));
    });
    document.querySelectorAll("[data-panel]").forEach((panel) => {
      const isActive = panel.dataset.panel === tab.dataset.tab;
      panel.classList.toggle("is-active", isActive);
      panel.hidden = !isActive;
    });
  });
});
