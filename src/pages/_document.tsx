import Document, { Head, Html, Main, NextScript } from 'next/document'

type Props = {
  nonce?: string
}

export default class MyDocument extends Document<Props> {
  static async getInitialProps(ctx: any) {
    const initialProps = await Document.getInitialProps(ctx)
    const nonce =
      (ctx?.req?.headers?.['x-nonce'] as string | undefined) ||
      (ctx?.req?.headers?.['X-Nonce'] as string | undefined) ||
      // For SSG pages there is no request, so we need a build-time stable nonce.
      ((process.env.CSP_NONCE as string | undefined) || 'zap-scan-nonce') ||
      undefined

    return { ...initialProps, nonce }
  }

  render() {
    const nonce = this.props.nonce

    return (
      <Html lang="ja">
        {/* nonce props are used by Next.js to apply CSP nonces to tags it controls */}
        <Head nonce={nonce} />
        <body>
          <Main />
          <NextScript nonce={nonce} />
        </body>
      </Html>
    )
  }
}
