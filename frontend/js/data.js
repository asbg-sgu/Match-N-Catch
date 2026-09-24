/* ============================================================
   BẮT MÂY — Flying Cloud Quiz (Match & Catch MVP v0.5)
   Schema + loader bộ câu hỏi. Nguồn duy nhất khi chạy thật là
   js/questions.json (anh tác giả chỉ sửa file đó).
   Thứ tự loader (để sau này API gắn vào không sửa code):
     1. window.__QUESTION_PACK (API/BE inject trước game.js)
     2. fetch('js/questions.json')
     3. EMBEDDED_FALLBACK (gói cứu hộ khi mở file:// hoặc mất mạng)

   Schema 1 câu thường:
     { id, provider?(vòng 1: 'aws'|'gcp'), text, icon,
       options: [{ id, label, icon? }], correctOptionId,
       timeLimitMs? (mặc định CFG.qTime) }
   Schema 1 câu bonus (chọn NHIỀU đáp án, khớp tuyệt đối mới điểm):
     { id, difficulty: 'basic'|'inter', text,
       options: [{ id, name, tag, icon }],
       correctOptionIds: [id, ...] (>= 2 đáp án đúng),
       timeLimitMs? (mặc định CFG.bonusTime) }
   ============================================================ */
'use strict';

const ICON = (p) => 'assets/icons/' + p;
const PACK_URL = 'js/questions.json';

/* ---------- Mô tả 2 vòng ---------- */
const ROUNDS = [
  { id: 1, label: 'VÒNG 1 / 2', title: 'Nhận diện nhà cung cấp', desc: 'Dịch vụ này thuộc nhà cung cấp đám mây nào? Coi chừng đáp án nhái sai chính tả!' },
  { id: 2, label: 'VÒNG 2 / 2', title: 'Hiểu dịch vụ AWS', desc: 'Dịch vụ AWS này chủ yếu dùng để làm gì? Bay nhanh hơn rồi — bình tĩnh nhé!' },
];

/* ---------- Hằng số luật chơi (PRD mục 3–5) ---------- */
const CFG = {
  lives: 3,
  mainPerRound: 10,      // 2 vòng × 10 câu = tối đa 20 điểm chính
  qTime: 5000,           // 5 giây / câu chính
  bonusTime: 10000,      // mặc định / câu bonus (câu bonus có timeLimitMs riêng thì dùng nó)
  streakForBonus: 5,     // chuỗi 5 đúng liên tiếp mở bonus
  maxBonus: 2,           // tối đa 2 bonus / lượt
  bonusScore: 3,         // bonus đúng hết +3, sai 1 câu +0
  giftMainMin: 12,       // ngưỡng quà = REWARD_THRESHOLD của BE (.env), tính trên tổng điểm
  maxPlays: 3,           // tối đa 3 lượt / MSSV
  focusMs: 950,          // câu hỏi hiện to giữa màn hình
  flyMsR1: 5200,         // thời gian 1 đáp án bay hết màn hình — vòng 1 (ms, càng lớn càng chậm)
  flyMsR2: 4500,         // thời gian bay — vòng 2
  speedStep: 0.06,       // mỗi block 5 câu tăng 6% tốc độ bay (chậm, dễ nhìn)
};

/* ---------- Gói cứu hộ: đủ để game không sập khi thiếu JSON ---------- */
const EMBEDDED_FALLBACK = {
  version: 1,
  rounds: [
    {
      id: 1, title: 'Nhận diện nhà cung cấp',
      questions: [
        {
          id: 'fb-r1-s3', cardId: 'aws-s3', provider: 'aws',
          text: 'Amazon S3 thuộc nhà cung cấp đám mây nào?',
          icon: ICON('aws/s3.svg'),
          options: [
            { id: 'aws', label: 'Amazon Web Services', icon: 'assets/logos/aws-dark.png' },
            { id: 'gcp', label: 'Google Cloud', icon: ICON('brands/gcp.svg') },
            { id: 'fb1', label: 'Amazon Web Service', icon: 'assets/logos/aws-dark.png' },
            { id: 'fb2', label: 'Go0gle Cloud', icon: ICON('brands/gcp.svg') },
          ],
          correctOptionId: 'aws',
        },
        {
          id: 'fb-r1-gke', cardId: 'gcp-gke', provider: 'gcp',
          text: 'Google Kubernetes Engine thuộc nhà cung cấp đám mây nào?',
          icon: ICON('gcp/gke.svg'),
          options: [
            { id: 'aws', label: 'Amazon Web Services', icon: 'assets/logos/aws-dark.png' },
            { id: 'gcp', label: 'Google Cloud', icon: ICON('brands/gcp.svg') },
            { id: 'fb1', label: 'Amazone Web Services', icon: 'assets/logos/aws-dark.png' },
            { id: 'fb2', label: 'Google Cloude', icon: ICON('brands/gcp.svg') },
          ],
          correctOptionId: 'gcp',
        },
      ],
    },
    {
      id: 2, title: 'Hiểu dịch vụ AWS',
      questions: [
        {
          id: 'fb-r2-s3', cardId: 'aws-s3',
          text: 'Amazon S3 chủ yếu dùng để làm gì?',
          icon: ICON('aws/s3.svg'),
          options: [
            { id: 'a', label: 'Lưu trữ object (Object Storage)' },
            { id: 'b', label: 'Chạy máy ảo (VM)' },
            { id: 'c', label: 'Hàng đợi tin nhắn (Message Queue)' },
          ],
          correctOptionId: 'a',
        },
        {
          id: 'fb-r2-lambda', cardId: 'aws-lambda',
          text: 'AWS Lambda dùng để làm gì?',
          icon: ICON('aws/lambda.svg'),
          options: [
            { id: 'a', label: 'Chạy code không cần quản lý server' },
            { id: 'b', label: 'Lưu trữ file tĩnh' },
            { id: 'c', label: 'Phân phối nội dung CDN' }
          ],
          correctOptionId: 'a',
        },
      ],
    },
  ],
  bonus: [
    {
      id: 'fb-mb1', difficulty: 'basic', timeLimitMs: 15000,
      text: 'Shop online cần chỗ lưu ảnh sản phẩm VÀ tự động tạo ảnh thumbnail khi có ảnh mới. Chọn TẤT CẢ dịch vụ cần dùng.',
      options: [
        { id: 'o1', name: 'Amazon S3', tag: 'Object storage', icon: ICON('aws/s3.svg') },
        { id: 'o2', name: 'AWS Lambda', tag: 'Serverless compute', icon: ICON('aws/lambda.svg') },
        { id: 'o3', name: 'Amazon RDS', tag: 'Database quan hệ', icon: ICON('aws/rds.svg') },
        { id: 'o4', name: 'Amazon Route 53', tag: 'DNS', icon: ICON('aws/route53.svg') },
      ],
      correctOptionIds: ['o1', 'o2'],
    },
  ],
};

/* ---------- validate + loader ---------- */
function validatePack(p) {
  const errs = [];
  if (!p || typeof p !== 'object') return ['pack không phải object'];
  if (!Array.isArray(p.rounds) || p.rounds.length < 2) errs.push('thiếu rounds[2]');
  (p.rounds || []).forEach((r, ri) => {
    if (!Array.isArray(r.questions) || !r.questions.length) { errs.push('round ' + ri + ' thiếu questions'); return; }
    r.questions.forEach((q, qi) => {
      if (!q.id || !q.text || !Array.isArray(q.options) || q.options.length < 2) errs.push('round ' + ri + ' q' + qi + ' thiếu id/text/options');
      else if (!q.options.some((o) => o.id === q.correctOptionId)) errs.push('round ' + ri + ' q' + qi + ' correctOptionId không khớp options');
    });
  });
  if (!Array.isArray(p.bonus) || !p.bonus.length) errs.push('thiếu bonus');
  (p.bonus || []).forEach((b, bi) => {
    if (!b.id || !b.text || !Array.isArray(b.options) || !Array.isArray(b.correctOptionIds) || b.correctOptionIds.length < 2)
      errs.push('bonus ' + bi + ' phải có >= 2 đáp án đúng (correctOptionIds)');
  });
  return errs;
}

let __packCache = null;
async function loadPack() {
  if (__packCache) return __packCache;
  // 1. API/BE inject
  if (window.__QUESTION_PACK) {
    const errs = validatePack(window.__QUESTION_PACK);
    if (!errs.length) {
      window.__PACK_SOURCE = 'api';
      __packCache = window.__QUESTION_PACK;
      console.info('[pack] dùng window.__QUESTION_PACK (API)');
      return __packCache;
    }
    console.warn('[pack] __QUESTION_PACK lỗi, bỏ qua:', errs);
  }
  // 2. file JSON tĩnh
  try {
    const res = await fetch(PACK_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    const errs = validatePack(j);
    if (errs.length) throw new Error('schema lỗi: ' + errs.join('; '));
    window.__PACK_SOURCE = 'json';
    __packCache = j;
    console.info('[pack] đã nạp js/questions.json');
    return __packCache;
  } catch (e) {
    console.warn('[pack] không nạp được JSON (' + e.message + ') → dùng gói cứu hộ');
  }
  // 3. cứu hộ
  window.__PACK_SOURCE = 'fallback';
  __packCache = EMBEDDED_FALLBACK;
  return __packCache;
}
