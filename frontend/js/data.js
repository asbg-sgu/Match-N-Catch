/* ============================================================
   BẮT MÂY — Flying Cloud Quiz (Match & Catch MVP v0.4)
   Ngân hàng nội dung tĩnh (PRD mục 6): chỉnh ở đây, không cần UI.
   ============================================================ */
'use strict';

const ICON = (p) => 'assets/icons/' + p;

/* ---------- Dịch vụ cho Vòng 1: nhận diện nhà cung cấp ---------- */
const SERVICES = {
  aws: [
    { id: 's3',         name: 'Amazon S3',      tag: 'Object Storage',    icon: ICON('aws/s3.svg') },
    { id: 'lambda',     name: 'AWS Lambda',     tag: 'Serverless compute', icon: ICON('aws/lambda.svg') },
    { id: 'ec2',        name: 'Amazon EC2',     tag: 'Máy chủ ảo',         icon: ICON('aws/ec2.svg') },
    { id: 'rds',        name: 'Amazon RDS',     tag: 'Database quan hệ',   icon: ICON('aws/rds.svg') },
    { id: 'dynamodb',   name: 'Amazon DynamoDB',tag: 'NoSQL key-value',    icon: ICON('aws/dynamodb.svg') },
    { id: 'sqs',        name: 'Amazon SQS',     tag: 'Hàng đợi tin nhắn',  icon: ICON('aws/sqs.svg') },
    { id: 'route53',    name: 'Amazon Route 53',tag: 'DNS',                icon: ICON('aws/route53.svg') },
    { id: 'eks',        name: 'Amazon EKS',     tag: 'Kubernetes',         icon: ICON('aws/eks.svg') },
    { id: 'redshift',   name: 'Amazon Redshift',tag: 'Data warehouse',     icon: ICON('aws/redshift.svg') },
    { id: 'cloudfront', name: 'Amazon CloudFront', tag: 'CDN',             icon: ICON('aws/cloudfront.svg') },
  ],
  gcp: [
    { id: 'bigquery', name: 'BigQuery',          tag: 'Data warehouse',   icon: ICON('gcp/bigquery.svg') },
    { id: 'gcs',      name: 'Cloud Storage',     tag: 'Object storage',   icon: ICON('gcp/storage.svg') },
    { id: 'run',      name: 'Cloud Run',         tag: 'Serverless containers', icon: ICON('gcp/run.svg') },
    { id: 'gce',      name: 'Compute Engine',    tag: 'Máy chủ ảo',        icon: ICON('gcp/compute.svg') },
    { id: 'sql',      name: 'Cloud SQL',         tag: 'Database quan hệ',  icon: ICON('gcp/sql.svg') },
    { id: 'firestore',name: 'Firestore',         tag: 'NoSQL',             icon: ICON('gcp/firestore.svg') },
    { id: 'pubsub',   name: 'Pub/Sub',           tag: 'Messaging',         icon: ICON('gcp/pubsub.svg') },
    { id: 'dns',      name: 'Cloud DNS',         tag: 'DNS',               icon: ICON('gcp/dns.svg') },
    { id: 'gke',      name: 'Google Kubernetes Engine', tag: 'Kubernetes', icon: ICON('gcp/gke.svg') },
    { id: 'cdn',      name: 'Cloud CDN',         tag: 'CDN',               icon: ICON('gcp/cdn.svg') },
  ],
};

/* ---------- Nhà cung cấp (đáp án bay của Vòng 1) ---------- */
const PROVIDERS = [
  { id: 'aws',    name: 'AWS',          icon: ICON('brands/aws.svg') },
  { id: 'gcp',    name: 'Google Cloud', icon: ICON('brands/gcp.svg') },
  { id: 'azure',  name: 'Azure',        icon: ICON('brands/azure.svg') },
  { id: 'oracle', name: 'Oracle Cloud', icon: ICON('brands/oracle.svg') },
];

/* ---------- Vòng 2: hiểu dịch vụ AWS (mỗi lượt chọn ngẫu nhiên 10/14) ---------- */
const ROUND2_BANK = [
  { icon: ICON('aws/s3.svg'),         q: 'Amazon S3 chủ yếu dùng để làm gì?', o: ['Lưu trữ object (Object Storage)', 'Chạy máy ảo (VM)', 'Hàng đợi tin nhắn (Message Queue)'], c: 0 },
  { icon: ICON('aws/lambda.svg'),     q: 'AWS Lambda dùng để làm gì?', o: ['Chạy code không cần quản lý server', 'Lưu trữ file tĩnh', 'Phân phối nội dung CDN'], c: 0 },
  { icon: ICON('aws/ec2.svg'),        q: 'Amazon EC2 cung cấp gì?', o: ['Máy chủ ảo trên đám mây', 'Dịch vụ DNS tên miền', 'Kho dữ liệu phân tích'], c: 0 },
  { icon: ICON('aws/rds.svg'),        q: 'Amazon RDS là dịch vụ gì?', o: ['Cơ sở dữ liệu quan hệ được quản lý', 'Serverless compute', 'Mạng phân phối nội dung'], c: 0 },
  { icon: ICON('aws/dynamodb.svg'),   q: 'Amazon DynamoDB là loại database nào?', o: ['NoSQL key-value', 'SQL quan hệ', 'Data warehouse'], c: 0 },
  { icon: ICON('aws/sqs.svg'),        q: 'Amazon SQS giúp giải quyết nhu cầu nào?', o: ['Tách rời dịch vụ bằng hàng đợi tin nhắn', 'Tăng tốc độ tải website', 'Quản lý tên miền'], c: 0 },
  { icon: ICON('aws/route53.svg'),    q: 'Amazon Route 53 dùng chủ yếu cho việc gì?', o: ['DNS và định tuyến tên miền', 'Lưu trữ dữ liệu', 'Chạy code serverless'], c: 0 },
  { icon: ICON('aws/cloudfront.svg'), q: 'Amazon CloudFront là gì?', o: ['Mạng phân phối nội dung (CDN)', 'Cơ sở dữ liệu NoSQL', 'Máy chủ ảo'], c: 0 },
  { icon: ICON('aws/eks.svg'),        q: 'Amazon EKS giúp bạn làm gì?', o: ['Chạy Kubernetes được quản lý', 'Gửi email hàng loạt', 'Kho dữ liệu phân tích'], c: 0 },
  { icon: ICON('aws/redshift.svg'),   q: 'Amazon Redshift dùng cho mục đích nào?', o: ['Kho dữ liệu phân tích (Data warehouse)', 'Máy chủ ảo', 'Dịch vụ DNS'], c: 0 },
  { icon: ICON('aws/cloudwatch.svg'), q: 'Amazon CloudWatch dùng để làm gì?', o: ['Giám sát, theo dõi log và metric', 'Mạng phân phối nội dung', 'Database NoSQL'], c: 0 },
  { icon: ICON('aws/apigateway.svg'), q: 'Amazon API Gateway dùng để làm gì?', o: ['Tạo và quản lý API', 'Lưu trữ object', 'Hàng đợi tin nhắn'], c: 0 },
  { icon: ICON('aws/sns.svg'),        q: 'Amazon SNS dùng để làm gì?', o: ['Gửi thông báo publish/subscribe', 'Máy chủ ảo', 'Quản lý tên miền'], c: 0 },
  { icon: ICON('aws/vpc.svg'),        q: 'Amazon VPC dùng để làm gì?', o: ['Tạo mạng riêng ảo biệt lập', 'Lưu trữ file', 'Chạy code serverless'], c: 0 },
];

/* ---------- Bonus: scenario chọn dịch vụ (3 basic + 3 intermediate, không lặp trong 1 lượt) ---------- */
const BONUS_BANK = [
  { id: 'b1', d: 'basic', q: 'Bạn vừa upload một tấm ảnh lên web và muốn tự động resize ảnh ngay khi ảnh tới, không muốn quản lý server. Chọn dịch vụ phù hợp nhất.',
    o: [{ n: 'AWS Lambda', t: 'Serverless compute', i: ICON('aws/lambda.svg') }, { n: 'Amazon RDS', t: 'Database quan hệ', i: ICON('aws/rds.svg') }, { n: 'Amazon CloudFront', t: 'CDN toàn cầu', i: ICON('aws/cloudfront.svg') }, { n: 'Amazon S3', t: 'Object storage', i: ICON('aws/s3.svg') }], c: 0 },
  { id: 'b2', d: 'basic', q: 'Web bán hàng cần lưu hàng nghìn ảnh sản phẩm và cho tải về bất cứ lúc nào với độ bền cao. Chọn dịch vụ phù hợp nhất.',
    o: [{ n: 'Amazon S3', t: 'Object storage', i: ICON('aws/s3.svg') }, { n: 'Amazon SQS', t: 'Hàng đợi tin nhắn', i: ICON('aws/sqs.svg') }, { n: 'AWS Lambda', t: 'Serverless compute', i: ICON('aws/lambda.svg') }, { n: 'Amazon RDS', t: 'Database quan hệ', i: ICON('aws/rds.svg') }], c: 0 },
  { id: 'b3', d: 'basic', q: 'Người dùng ở nhiều quốc gia; bạn muốn website tải nhanh ở mọi nơi. Chọn dịch vụ phù hợp nhất.',
    o: [{ n: 'Amazon CloudFront', t: 'CDN toàn cầu', i: ICON('aws/cloudfront.svg') }, { n: 'Amazon EC2', t: 'Máy chủ ảo', i: ICON('aws/ec2.svg') }, { n: 'Amazon DynamoDB', t: 'NoSQL key-value', i: ICON('aws/dynamodb.svg') }, { n: 'Amazon Route 53', t: 'DNS', i: ICON('aws/route53.svg') }], c: 0 },
  { id: 'b4', d: 'inter', q: 'Hệ thống nhận đơn hàng rồi chuyển cho bộ phận xử lý; nếu bộ phận xử lý đang bận, đơn hàng vẫn không bị mất. Chọn dịch vụ phù hợp nhất.',
    o: [{ n: 'Amazon SQS', t: 'Hàng đợi tin nhắn', i: ICON('aws/sqs.svg') }, { n: 'Amazon Route 53', t: 'DNS', i: ICON('aws/route53.svg') }, { n: 'Amazon EC2', t: 'Máy chủ ảo', i: ICON('aws/ec2.svg') }, { n: 'Amazon SNS', t: 'Thông báo pub/sub', i: ICON('aws/sns.svg') }], c: 0 },
  { id: 'b5', d: 'inter', q: 'Bạn có tên miền shopcuatoi.vn và muốn trỏ tới máy chủ, đồng thời phân tuyến giữa nhiều vùng. Chọn dịch vụ phù hợp nhất.',
    o: [{ n: 'Amazon Route 53', t: 'DNS', i: ICON('aws/route53.svg') }, { n: 'Amazon S3', t: 'Object storage', i: ICON('aws/s3.svg') }, { n: 'AWS Lambda', t: 'Serverless compute', i: ICON('aws/lambda.svg') }, { n: 'Amazon CloudFront', t: 'CDN toàn cầu', i: ICON('aws/cloudfront.svg') }], c: 0 },
  { id: 'b6', d: 'inter', q: 'App cần lưu dữ liệu dạng key-value với quy mô rất lớn và độ trễ thấp. Chọn dịch vụ phù hợp nhất.',
    o: [{ n: 'Amazon DynamoDB', t: 'NoSQL key-value', i: ICON('aws/dynamodb.svg') }, { n: 'Amazon RDS', t: 'Database quan hệ', i: ICON('aws/rds.svg') }, { n: 'Amazon CloudFront', t: 'CDN toàn cầu', i: ICON('aws/cloudfront.svg') }, { n: 'Amazon EC2', t: 'Máy chủ ảo', i: ICON('aws/ec2.svg') }], c: 0 },
];

/* ---------- Mô tả 2 vòng ---------- */
const ROUNDS = [
  { id: 1, label: 'VÒNG 1 / 2', title: 'Nhận diện nhà cung cấp', desc: 'Dịch vụ này thuộc nhà cung cấp đám mây nào? Đọc câu hỏi, bắt đúng đáp án đang bay!' },
  { id: 2, label: 'VÒNG 2 / 2', title: 'Hiểu dịch vụ AWS', desc: 'Dịch vụ AWS này chủ yếu dùng để làm gì? Bay nhanh hơn rồi — bình tĩnh nhé!' },
];

/* ---------- Hằng số luật chơi (PRD mục 3–5) ---------- */
const CFG = {
  lives: 3,
  mainPerRound: 10,      // 2 vòng × 10 câu = tối đa 20 điểm chính
  qTime: 5000,           // 5 giây / câu chính
  bonusTime: 10000,      // 10 giây / câu bonus
  streakForBonus: 5,     // chuỗi 5 đúng liên tiếp mở bonus
  maxBonus: 2,           // tối đa 2 bonus / lượt
  bonusScore: 3,         // bonus đúng +3
  giftMainMin: 10,       // quà khi điểm chính >= 10
  maxPlays: 3,           // tối đa 3 lượt / MSSV
  focusMs: 950,          // câu hỏi hiện to giữa màn hình
};
