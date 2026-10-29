// Reserved integration boundary. Enabling requires the approved BGG adapter,
// candidate selection and field-conflict review; setting a token alone does not enable it.
exports.handler = async () => ({
  statusCode: 503,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify({ code: 'BGG_NOT_CONNECTED', message: 'BGG 尚未連結' })
});
