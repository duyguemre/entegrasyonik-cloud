/**
 * frontend/src/help/content/en/articles.ts — Help center articles (English, partial).
 *
 * Every article id in `content/tr/articles.ts` has an English title + summary here. A full English body is provided
 * only for the getting-started articles; other articles fall back to the Turkish body (the screen shows a
 * "Turkish only" note). `goToLabels` follow the order of the TR article's `goTo` list.
 * Same content rule as TR: only features that really exist in the app (evidence is listed above each TR article).
 */
import type { HelpArticleTranslation } from '../../types'

export const ARTICLES_EN: Record<string, HelpArticleTranslation> = {
  // ───────────── Getting started ─────────────
  'gs-account': {
    title: 'Your account and first sign-in',
    summary: 'Creating an account, signing in, choosing a store, verifying your email and resetting your password.',
    goToLabels: ['Open My account and security'],
    body: [
      { type: 'p', text: 'The Entegrasyonik sign-in screen has three tabs: **Sign in**, **Register** and **Forgot password**. Your account belongs to a store (business); if you have access to more than one store, you choose which one to manage after signing in.' },
      { type: 'h', text: 'Creating an account' },
      {
        type: 'steps',
        items: [
          'Open the **Register** tab on the sign-in screen.',
          'Enter your first name, last name, email and password; type the password again in the second field.',
          'Tick the box accepting the Terms of Use, Subscription Agreement and Preliminary Information Form, then complete the registration.',
          'If you arrived from the website after choosing a plan, the **Subscription and plans** screen opens with that plan selected.',
        ],
      },
      { type: 'h', text: 'Signing in and choosing a store' },
      {
        type: 'steps',
        items: [
          'Sign in with your email and password.',
          'If a **security code** field appears, type the code shown in the box; use the refresh button if it is hard to read.',
          'If you have several stores, pick one from the store list (you can search within the list).',
        ],
      },
      { type: 'h', text: 'Verifying your email' },
      { type: 'p', text: 'After registration a verification link is sent to your email address. The link is valid for **24 hours**. You can see your verification status in the **Email verification** section of **My account and security**; if the link did not arrive, use the send-verification-link button in the same section.' },
      { type: 'note', tone: 'info', text: 'An unverified account is not blocked from signing in today, but verifying your address is recommended so that password resets and security notifications reach you.' },
      { type: 'h', text: 'If you forgot your password' },
      {
        type: 'steps',
        items: [
          'Open the **Forgot password** tab and enter your email address.',
          'Open the link in the email and set a new password. The link is valid for **30 minutes** and can be used once.',
          'Sign in with your new password. Resetting the password signs you out of all open sessions.',
        ],
      },
      { type: 'note', tone: 'info', text: 'For security, the screen never tells whether an email address is registered; the message is always the same. If no email arrives, check your spam folder.' },
    ],
  },
  'gs-first-integration': {
    title: 'Connecting your first integration',
    summary: 'Connect a marketplace, your online store or your ERP account to Entegrasyonik with its API credentials.',
    goToLabels: ['Open marketplace integrations', 'Open integration health'],
    body: [
      { type: 'p', text: 'To let products, stock and orders flow through Entegrasyonik, first connect at least one sales channel. The connection uses the API credentials you get from the channel’s seller panel. Channels you can connect today: Trendyol, Hepsiburada, N11 and Pazarama (marketplaces), Ideasoft (online store, test environment) and Bizimhesap (ERP).' },
      {
        type: 'steps',
        items: [
          'Get your API credentials from the channel’s seller or store panel. The required credential types are listed in the table in the **Channel connection steps** article.',
          'In the left menu open **Integrations** and the channel type (Marketplace, E-commerce or ERP).',
          'Pick the channel from the channel icons at the top.',
          'On the **API information** tab enter the credentials and switch on **Integration status**.',
          'On the **Default information** tab fill in the defaults the channel needs, such as carrier, shipping time, shipping address and return address.',
          'Press **Save**. If something is missing, the screen tells you which information is required.',
        ],
      },
      { type: 'p', text: 'After saving, a **What works on this channel** section appears on the same screen. It shows whether capabilities such as product transfer, stock and price, order import and returns are supported or limited on that channel.' },
      { type: 'note', tone: 'warning', text: 'Your API credentials are stored encrypted and are not shown in plain text after saving. If you regenerate a key in the channel panel, enter the new one in Entegrasyonik as well; otherwise requests will be rejected.' },
      { type: 'note', tone: 'info', text: 'You can monitor the connection on the **Integration health** screen. It does not send test requests to the marketplace; it shows the results of real calls.' },
    ],
  },
  'gs-first-product-transfer': {
    title: 'Your first product transfer',
    summary: 'Create products or import them from a marketplace, complete the mappings and send the products to a marketplace.',
    goToLabels: ['Open products', 'Open operation logs'],
    body: [
      { type: 'p', text: 'Product transfer works in two directions: you can **send** products from Entegrasyonik to a marketplace, or **import** products you already sell on a marketplace into Entegrasyonik. Sending does not start automatically; you start it from the **Bulk actions** menu on the product list.' },
      { type: 'h', text: '1. Prepare the product' },
      {
        type: 'steps',
        items: [
          'On the **Products** screen press **New product**. The form has four steps: Category, Product definition, Variant (or single product) information and Details.',
          'Enter category, brand, title, stock code, barcode, price and stock. The **Required information** indicator at the top of the form lists what is missing.',
          'Or, to bring in products from a marketplace, choose **Bulk actions > Import products from platform** and pick the channel.',
        ],
      },
      { type: 'h', text: '2. Complete the mappings' },
      { type: 'p', text: 'A marketplace expects products with its own category, brand and attribute definitions. Map your category on the **Categories** screen and your brand on the **Brands** screen to the channel’s counterparts, and fill in the channel’s required attributes in the product form.' },
      { type: 'h', text: '3. Send to the marketplace' },
      {
        type: 'steps',
        items: [
          'On the **Products** screen select the products to send.',
          'Choose **Bulk actions > Upload to platforms**.',
          'Choose the scope: **Selected**, **Filtered** (the whole current filter result) or **Entire catalog**.',
          'Tick the target channels and confirm.',
          'Follow the progress on the **Operation logs** screen: Queued → Validating product → Sending to marketplace → Checking submission → Awaiting product approval → Completed.',
        ],
      },
      { type: 'note', tone: 'info', text: 'For products without variants, the channel icon in the **Platform status** column shows whether the product has been uploaded to that channel and whether it is marked “ready to send”; click the icon to toggle the ready mark.' },
      { type: 'note', tone: 'warning', text: 'Product approval is the marketplace’s own process and can take time. If a submission fails, see the details in the operation log.' },
    ],
  },

  // ───────────── Using the app ─────────────
  'app-menu': {
    title: 'Menu and navigation',
    summary: 'Using, collapsing and marking favorites in the left menu, and making more room on screen.',
    goToLabels: ['Open overview'],
  },
  'app-search': {
    title: 'Smart search',
    summary: 'Use the smart search in the top bar to reach screens, orders, products, customers and return requests quickly.',
  },
  'app-workspace-tabs': {
    title: 'Workspace tabs',
    summary: 'Keep several screens open in tabs, switch between them and close them in bulk.',
  },
  'app-shortcuts': {
    title: 'Keyboard shortcuts',
    summary: 'All keyboard shortcuts in the app and how they behave in text fields.',
  },
  'app-filters-views': {
    title: 'Filters and saved views',
    summary: 'Filter lists, manage applied filters and save frequently used filters as views.',
    goToLabels: ['Open orders'],
  },
  'app-bulk-actions': {
    title: 'Bulk actions',
    summary: 'Select several records in a list and apply the same action at once.',
  },
  'app-context-menu': {
    title: 'Context menu',
    summary: 'Reach actions quickly with the row “more actions” menu and the right-click menu on tabs.',
  },
  'app-theme': {
    title: 'Light and dark appearance',
    summary: 'The app currently runs in light appearance only; options you can use to make the screen more comfortable.',
  },
  'app-notifications': {
    title: 'Notification center',
    summary: 'View, mark as read and delete your bulk action, transfer, order and stock notifications.',
    goToLabels: ['Open notifications'],
  },
  'app-page-help': {
    title: 'About this page panel, hints and app tour',
    summary: 'Get to know screens with the (i) panel on every page, (?) hints on key fields and the optional app tour.',
  },

  // ───────────── Catalog ─────────────
  'cat-products-variants': {
    title: 'Products and variants',
    summary: 'Creating single and variant products, option groups and managing variant information.',
    goToLabels: ['Open products', 'Open variant groups'],
  },
  'cat-bulk-editor': {
    title: 'Bulk editor',
    summary: 'Edit stock, prices, codes and channel prices of a product’s variants in bulk on a table.',
    goToLabels: ['Open products'],
  },
  'cat-mapping': {
    title: 'Category, brand and attribute mapping',
    summary: 'Map your categories, brands and options to each channel’s counterparts; this is what makes transfers work.',
    goToLabels: ['Open categories', 'Open brands', 'Open variant groups'],
  },
  'cat-required-attributes': {
    title: 'Required attributes',
    summary: 'Fill in the attributes a marketplace requires for the category in the product form.',
    goToLabels: ['Open products'],
  },

  // ───────────── Stock ─────────────
  'stock-single': {
    title: 'Single stock',
    summary: 'Each variant has one stock quantity; all channels are published from this stock.',
    goToLabels: ['Open products', 'Open stock health'],
  },
  'stock-reservation': {
    title: 'Reservations and preventing overselling',
    summary: 'How stock is reserved for incoming orders, how overselling is prevented and what to do if it happens.',
    goToLabels: ['Open stock health', 'Open orders'],
  },
  'stock-channel-policy': {
    title: 'Channel stock policy and safety stock',
    summary: 'Choose the primary channel, set buffers (safety stock) for other channels and configure oversell handling.',
    goToLabels: ['Open stock policy'],
  },
  'stock-health': {
    title: 'Stock health',
    summary: 'Monitor open oversells, unmatched order lines and variant stock balance on one screen.',
    goToLabels: ['Open stock health'],
  },

  // ───────────── Orders and returns ─────────────
  'ord-lifecycle': {
    title: 'Order lifecycle',
    summary: 'The statuses an order goes through from arrival to delivery and what you can do in each.',
    goToLabels: ['Open orders'],
  },
  'ord-approve-cancel': {
    title: 'Approving and cancelling',
    summary: 'Approve orders one by one or in bulk; cancel them with the channel’s cancellation reason when needed.',
    goToLabels: ['Open orders'],
  },
  'ord-returns': {
    title: 'Returns',
    summary: 'Review return requests from marketplaces, approve them or reject them with a reason.',
    goToLabels: ['Open returns'],
  },
  'ord-messages-sla': {
    title: 'Customer messages and waiting times',
    summary: 'Answer customer questions from marketplaces and prioritise them with the waiting-time indicator.',
    goToLabels: ['Open messages'],
  },

  // ───────────── Integrations ─────────────
  'int-channel-connect': {
    title: 'Channel connection steps',
    summary: 'Which credentials each channel needs and the general connection steps.',
    goToLabels: ['Open marketplace integrations', 'Open e-commerce integrations', 'Open ERP integrations'],
  },
  'int-scope': {
    title: 'Scope and “Coming soon”',
    summary: 'Which integrations work today, what the “Coming soon” label means and how to see coverage per channel.',
    goToLabels: ['Open marketplace integrations', 'Open shipping integrations', 'Open e-invoice integrations'],
  },
  'int-errors': {
    title: 'What integration error messages mean',
    summary: 'The meaning of the error panel shown when channel data (categories, attributes, values) cannot be loaded, and what to do.',
    goToLabels: ['Open integration health'],
  },
  'int-health': {
    title: 'Integration health and operation logs',
    summary: 'Monitor your channels’ connection status, latest errors and the details of product send/import operations.',
    goToLabels: ['Open integration health', 'Open operation logs', 'Open audit log'],
  },

  // ───────────── Finance ─────────────
  'fin-overview': {
    title: 'Finance screen',
    summary: 'Track marketplace earnings, deductions, shipping invoices and payouts in four views.',
    goToLabels: ['Open finance'],
  },
  'fin-invoices-reports': {
    title: 'Invoices, printouts and reports',
    summary: 'Entering invoice details for orders, printing shipping labels, exporting to Excel and overview summaries.',
    goToLabels: ['Open invoices', 'Open orders', 'Open overview'],
  },

  // ───────────── Account ─────────────
  'acc-password': {
    title: 'Password and account security',
    summary: 'Change your password, learn the strong password rules and verify your email address.',
    goToLabels: ['Open My account and security'],
  },
  'acc-users': {
    title: 'Users and permissions',
    summary: 'Add staff to your store, set their permission group and remove access.',
    goToLabels: ['Open authorization'],
  },
  'acc-privacy': {
    title: 'Privacy (KVKK): data export and deletion',
    summary: 'Download a copy of your store data or request deletion of your store.',
    goToLabels: ['Open data and privacy'],
  },
  'acc-subscription': {
    title: 'Subscription',
    summary: 'See your subscription status, compare plans and choose a plan.',
    goToLabels: ['Open subscription'],
  },

  // ───────────── Troubleshooting ─────────────
  'ts-product-not-sent': {
    title: 'My product did not reach the marketplace',
    summary: 'A step-by-step checklist when a product you sent does not appear on the marketplace.',
    goToLabels: ['Open operation logs', 'Open products'],
  },
  'ts-order-missing': {
    title: 'An order did not arrive',
    summary: 'What to check when an order you see on the marketplace is missing in Entegrasyonik.',
    goToLabels: ['Open orders', 'Open integration health'],
  },
  'ts-stock-mismatch': {
    title: 'Stock looks different',
    summary: 'Possible causes and fixes when marketplace stock differs from stock in Entegrasyonik.',
    goToLabels: ['Open stock health', 'Open stock policy'],
  },
  'ts-common': {
    title: 'Common errors',
    summary: 'What messages such as session expired, no permission, server unreachable and screen not found mean, and how to fix them.',
  },

  // ───────────── FAQ ─────────────
  'faq-general': {
    title: 'Frequently asked questions',
    summary: 'Short answers to the most frequently asked questions about Entegrasyonik.',
  },

  // ───────────── Support ─────────────
  'support-ticket': {
    title: 'Opening a support ticket',
    summary: 'Open a ticket with the support team from inside the app, follow replies and continue the conversation.',
    goToLabels: ['Open support tickets'],
  },
}
