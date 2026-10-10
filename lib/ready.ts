export function canAcceptAcknowledgments(): boolean {
  return (
    process.env.ACCEPT_ACKNOWLEDGMENTS === 'true' &&
    !!process.env.RESEND_API_KEY &&
    !!process.env.FROM_EMAIL &&
    !!process.env.LANDLORD_EMAIL &&
    !!process.env.TANDRA_EMAIL
  );
}
