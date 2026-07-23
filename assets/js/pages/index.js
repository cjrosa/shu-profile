function openInstDrawer() {
  var drawer = document.getElementById('instructor-drawer');
  var overlay = document.getElementById('inst-drawer-overlay');
  if (!drawer || !overlay) {
    return;
  }
  drawer.classList.add('open');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeInstDrawer() {
  var drawer = document.getElementById('instructor-drawer');
  var overlay = document.getElementById('inst-drawer-overlay');
  if (!drawer || !overlay) {
    return;
  }
  drawer.classList.remove('open');
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}
function openDrawer() { openInstDrawer(); }
function closeDrawer() { closeInstDrawer(); }
document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeDrawer(); });

// -- Course Advisor --
const advisorHistory = [];
let advisorPhotoSrc = '';
document.addEventListener('DOMContentLoaded', function() {
  const heroPhoto = document.querySelector('.hero-prof-photo');
  if (heroPhoto) {
    advisorPhotoSrc = heroPhoto.getAttribute('src');
    document.querySelectorAll('.advisor-panel-photo, .advisor-msg-avatar').forEach(function(el) {
      el.setAttribute('src', advisorPhotoSrc);
    });
  }
});
const advisorSystemPrompt = `You are Professor Chris Rosa, an Adjunct Professor of Computer Science at Sacred Heart University in Fairfield, CT. You are also a founding CTO with 25+ years of industry experience, most recently co-founding and scaling BeneLynk from 2 people to over 1,000 &mdash; architecting their cloud-native Azure healthcare platform. Before that you were at Siemens and held other senior engineering leadership roles. You hold an MS in Computer Science from SHU (Outstanding Master's Project Award) and a BS in Electrical Engineering from Northeastern.

You have been teaching for about one year. You teach four courses:
- CS-112 Data Structures (Python, 100-level, prereq CS-111): arrays, linked lists, BSTs, AVL trees, heaps, hash tables, graphs. You built a suite of interactive step-through visualizers for classroom use &mdash; students can pause, predict, and watch structures evolve in real time.
- CS-339 Networks & Data Communications (300-level, prereq CS-112): the full IP stack &mdash; TCP, IP addressing, CIDR, routing algorithms, NAT, ARP, MAC learning, link layer. You built advanced packet simulators that let students trace packets through every layer.
- CS-432 Cloud Computing (400-level, prereqs CS-112 and CS-339): real Azure infrastructure &mdash; compute, storage, networking, identity, Key Vault, Logic Apps, DevOps CI/CD pipelines. Built around your decade of firsthand Azure experience, targeting AZ-900 certification readiness.
- AI-100 Introduction to Artificial Intelligence (100-level, NO prereqs, first offering Fall 2026): designed for non-technical majors. Covers AI history, terminology, ethics, societal impact, data privacy, and introductory machine learning. Hands-on time in SHU's AI Lab. I'm taking the class from Professor French (frenchb2@sacredheart.edu), who taught it for a while and did an excellent job building a non-technical curriculum.

YOUR TEACHING PHILOSOPHY:
- Motivation before mechanism. Build intuition and mental models before introducing formalism. Students are far more receptive to formal definitions when they already have something to attach them to.
- Make abstract behavior visible. You build interactive tools because students learn dynamic processes by watching them unfold &mdash; not by reading about them.
- Industry context as a teaching asset. Your professional background is not separate from your teaching. When you explain TCP congestion control, you can speak to what happens when it breaks in production. When you introduce cloud architecture, you discuss the real tradeoffs engineering teams navigate.
- Scaffolded practice with intentional struggle. You give students well-structured code with specific components left unimplemented. The goal is for students to experience the satisfaction of making something work &mdash; not the frustration of staring at a blank file.
- You love analogies. Use them freely to make abstract ideas concrete.
- You are passionate about elegant code, cloud architecture, and continuous learning.

YOUR VOICE AND TONE:
- Conversational and generally direct. Not formal or stiff.
- Warm but not sycophantic. No hollow praise like "great question!"
- Use analogies naturally &mdash; you reach for them instinctively.
- Honest about difficulty. You don't sugarcoat.
- You care about whether students are actually prepared for industry, not just whether they pass.
- Occasionally reference your industry background when it genuinely adds context &mdash; but not to show off.

HARD RULES:
- NEVER recommend which course a student should take. That is a decision between the student and their academic advisor.
- Anything about an ongoing course (grades, assignments, deadlines, syllabus, office hours) belongs on Blackboard. Politely redirect.
- Questions outside CS, your courses, or career/field topics: suggest they email you directly at rosac75066@sacredheart.edu.
- Keep responses concise &mdash; keep it short and sweet, 1-3 SHORT paragraphs max. This is a chat, not a lecture.
- Do not ask for or share personal information. Keep it professional and focused on academics and career advice.
- Do not provide code solutions. You can give hints or explain concepts, but never share actual code for assignments.
- Do not speculate about future course offerings, department plans, or anything you don't have direct knowledge of. If you don't know, say so.
- Do not provide medical, legal, or mental health advice. Refer students to appropriate campus resources.
- Do not engage in philosophical debates or abstract hypotheticals. Keep it practical and grounded in real-world context.
- Do not make up specific assignment details, exam dates, or grading policies you don't know. Refer them to the syllabus or Blackboard.`;

function openAdvisor() {
  var f=document.getElementById("advisorFab");if(f)f.classList.add('is-hidden');
  document.getElementById('advisorOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('advisorInput').focus(), 320);
}
function closeAdvisor() {
  var f=document.getElementById("advisorFab");if(f)f.classList.remove('is-hidden');
  document.getElementById('advisorOverlay').classList.remove('open');
  document.body.style.overflow = '';
}
document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeAdvisor(); });
// Sticky banner
(function() {
  var banner = document.getElementById('stickyBanner');
  var hero   = document.querySelector('.hero');
  var sp     = document.getElementById('stickyPhoto');
  var hp     = document.querySelector('.hero-prof-photo');
  if (hp && sp) sp.src = hp.src;
  function onScroll() {
    if (!hero || !banner) return;
    var bannerVisible = hero.getBoundingClientRect().bottom < 0;
    bannerVisible ? banner.classList.add('visible') : banner.classList.remove('visible');
    // Shift drawer down so it isn't hidden behind the sticky banner
    var drawer = document.getElementById('instructor-drawer');
    if (drawer) drawer.style.top = bannerVisible ? '50px' : '0';
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

async function advisorSend() {
  const input = document.getElementById('advisorInput');
  const msg = input.value.trim();
  if (!msg) return;

  const sendBtn = document.getElementById('advisorSendBtn');
  input.value = '';
  sendBtn.disabled = true;

  // Add user message
  advisorHistory.push({ role: 'user', content: msg });
  appendAdvisorMessage('user', msg);

  // Show typing indicator
  document.getElementById('advisorTyping').classList.add('visible');
  scrollAdvisor();

  try {
    const response = await fetch('https://red-union-6b9e.crosa.workers.dev', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1000,
        system: advisorSystemPrompt,
        messages: advisorHistory
      })
    });
    const data = await response.json();
    const reply = data.content?.[0]?.text || "Sorry, I couldn't get a response &mdash; try again in a moment.";

    advisorHistory.push({ role: 'assistant', content: reply });
    document.getElementById('advisorTyping').classList.remove('visible');
    appendAdvisorMessage('prof', reply);
  } catch (e) {
    document.getElementById('advisorTyping').classList.remove('visible');
    appendAdvisorMessage('prof', "Something went wrong on my end &mdash; give it another try.");
  }

  sendBtn.disabled = false;
  input.focus();
}

function appendAdvisorMessage(role, text) {
  const msgs = document.getElementById('advisorMessages');
  const div = document.createElement('div');
  div.className = `advisor-msg ${role}`;

  if (role === 'prof') {
    div.innerHTML = `<img class="advisor-msg-avatar" src="${advisorPhotoSrc}" alt="Prof. Rosa"><div class="advisor-msg-bubble">${SHUMarkdown.renderAssistantMarkdown(text)}</div>`;
  } else {
    div.innerHTML = `<div class="advisor-msg-bubble">${SHUMarkdown.escapeHtml(text || '').replace(/\n/g,'<br>')}</div><div class="advisor-msg-avatar user-av">You</div>`;
  }
  msgs.appendChild(div);
  scrollAdvisor();
}

function scrollAdvisor() {
  const msgs = document.getElementById('advisorMessages');
  msgs.scrollTop = msgs.scrollHeight;
}

document.addEventListener('DOMContentLoaded', function() {
  const advisorInput = document.getElementById('advisorInput');
  if (advisorInput) {
    advisorInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); advisorSend(); }
    });
  }
});
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
}, { threshold: 0.08 });
document.querySelectorAll('.course-card').forEach(c => observer.observe(c));

// -- Stat counter animation --
function animateCount(el, target, duration) {
  const start = performance.now();
  const update = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(ease * target);
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}
window.addEventListener('load', () => {
  document.querySelectorAll('.hero-stat-num').forEach(el => {
    const target = parseInt(el.textContent, 10);
    if (!isNaN(target)) { el.textContent = '0'; animateCount(el, target, 1200); }
  });
});

document.querySelectorAll('.js-open-drawer').forEach(function(trigger) {
  trigger.addEventListener('click', function(event) {
    event.stopPropagation();
    openDrawer();
  });
  if (trigger.getAttribute('role') === 'button') {
    trigger.addEventListener('keydown', function(event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openDrawer();
      }
    });
  }
});

document.querySelectorAll('.js-open-advisor').forEach(function(trigger) {
  trigger.addEventListener('click', function(event) {
    event.stopPropagation();
    openAdvisor();
  });
});

document.querySelectorAll('.js-close-advisor').forEach(function(trigger) {
  trigger.addEventListener('click', closeAdvisor);
});

document.querySelectorAll('.js-stop-propagation').forEach(function(element) {
  element.addEventListener('click', function(event) { event.stopPropagation(); });
});

document.querySelectorAll('.js-scroll-target').forEach(function(trigger) {
  trigger.addEventListener('click', function() {
    var target = document.getElementById(trigger.dataset.scrollTarget);
    if (target) target.scrollIntoView({ behavior: 'smooth' });
  });
});

var advisorFab = document.getElementById('advisorFab');
if (advisorFab) advisorFab.addEventListener('click', openAdvisor);

var advisorSendButton = document.getElementById('advisorSendBtn');
if (advisorSendButton) advisorSendButton.addEventListener('click', advisorSend);
