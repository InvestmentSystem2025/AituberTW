import { Meta } from '@/components/meta'
import {
  ArrowPathIcon,
  BanknotesIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { useRouter } from 'next/router'
import { FormEvent, useMemo, useRef, useState } from 'react'

type CheckoutFields = {
  MerchantID: string
  TradeInfo: string
  TradeSha: string
  Version: string
}

type CheckoutData = {
  gatewayUrl: string
  amount: number
  merchantOrderNo: string
  fields: CheckoutFields
}

type CreateOrderResponse =
  | {
      success: true
      data: CheckoutData
    }
  | {
      success: false
      error: string
    }

const statusCopy = {
  success: {
    title: '付款流程已回到網站',
    message:
      '藍新回傳狀態為 SUCCESS。正式開通後，這裡可接續更新訂單或會員權限。',
    iconClass: 'text-emerald-600',
  },
  failed: {
    title: '付款未完成或驗證失敗',
    message:
      '請重新建立一筆測試付款，或確認 .env 的 MerchantID、HashKey、HashIV 是否正確。',
    iconClass: 'text-amber-600',
  },
}

const NewebPayTestPage = () => {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement | null>(null)
  const [email, setEmail] = useState('')
  const [checkout, setCheckout] = useState<CheckoutData | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const returnStatus = useMemo(() => {
    const value = router.query.status
    return value === 'success' || value === 'failed' ? value : null
  }, [router.query.status])

  const createOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setCheckout(null)
    setIsCreating(true)

    try {
      const response = await fetch('/api/payment/newebpay/create-test-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })
      const body = (await response.json()) as CreateOrderResponse
      if (!body.success) {
        throw new Error(body.error || '建立付款參數失敗')
      }
      setCheckout(body.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '建立付款參數失敗')
    } finally {
      setIsCreating(false)
    }
  }

  const submitToNewebPay = () => {
    formRef.current?.submit()
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Meta />

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <BanknotesIcon className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-normal text-slate-950">
                NewebPay 1 元測試付款
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                伺服器端產生 MPG 加密參數，瀏覽器只送出藍新需要的表單欄位。
              </p>
            </div>
          </div>
        </header>

        {returnStatus ? (
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              {returnStatus === 'success' ? (
                <CheckCircleIcon
                  className={`mt-0.5 h-6 w-6 ${statusCopy[returnStatus].iconClass}`}
                  aria-hidden="true"
                />
              ) : (
                <ExclamationTriangleIcon
                  className={`mt-0.5 h-6 w-6 ${statusCopy[returnStatus].iconClass}`}
                  aria-hidden="true"
                />
              )}
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  {statusCopy[returnStatus].title}
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {statusCopy[returnStatus].message}
                </p>
                {typeof router.query.order === 'string' ? (
                  <p className="mt-2 text-sm text-slate-500">
                    訂單編號：
                    <span className="font-mono">{router.query.order}</span>
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <form
            onSubmit={createOrder}
            className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  建立測試交易
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  金額固定由後端鎖定為 NT$1，避免前端被改值。Email 可留空。
                </p>
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-slate-700"
                >
                  付款人 Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="buyer@example.com"
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              {error ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isCreating}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isCreating ? (
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                ) : null}
                產生 1 元付款參數
              </button>
            </div>
          </form>

          <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-950">環境變數</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">NEWEBPAY_ENV</dt>
                <dd className="font-mono text-slate-800">test</dd>
              </div>
              <div>
                <dt className="text-slate-500">NEWEBPAY_MERCHANT_ID</dt>
                <dd className="text-slate-800">藍新商店代號</dd>
              </div>
              <div>
                <dt className="text-slate-500">NEWEBPAY_HASH_KEY / HASH_IV</dt>
                <dd className="text-slate-800">只放在 server-side .env</dd>
              </div>
            </dl>
          </aside>
        </section>

        {checkout ? (
          <section className="rounded-lg border border-emerald-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  付款參數已建立
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  訂單編號{' '}
                  <span className="font-mono">{checkout.merchantOrderNo}</span>
                  ， 金額 NT${checkout.amount}
                </p>
              </div>
              <button
                type="button"
                onClick={submitToNewebPay}
                className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                前往藍新付款頁
              </button>
            </div>

            <form
              ref={formRef}
              method="post"
              action={checkout.gatewayUrl}
              className="hidden"
            >
              <input
                type="hidden"
                name="MerchantID"
                value={checkout.fields.MerchantID}
              />
              <input
                type="hidden"
                name="TradeInfo"
                value={checkout.fields.TradeInfo}
              />
              <input
                type="hidden"
                name="TradeSha"
                value={checkout.fields.TradeSha}
              />
              <input
                type="hidden"
                name="Version"
                value={checkout.fields.Version}
              />
            </form>
          </section>
        ) : null}
      </main>
    </div>
  )
}

export default NewebPayTestPage
