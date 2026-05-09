/**
 * VAPID 키 페어 생성 (한 번만 실행)
 *
 * 결과를 .env (로컬) + Vercel 환경변수에 등록:
 *   VAPID_PUBLIC_KEY="..."
 *   VAPID_PRIVATE_KEY="..."
 *   VAPID_SUBJECT="mailto:cogogema86@gmail.com"
 *
 * 그리고 NEXT_PUBLIC_VAPID_PUBLIC_KEY=VAPID_PUBLIC_KEY 도 추가
 * (브라우저에서 subscribe 시 필요)
 */
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();
console.log("VAPID_PUBLIC_KEY=" + keys.publicKey);
console.log("VAPID_PRIVATE_KEY=" + keys.privateKey);
console.log('VAPID_SUBJECT="mailto:cogogema86@gmail.com"');
console.log("NEXT_PUBLIC_VAPID_PUBLIC_KEY=" + keys.publicKey);
