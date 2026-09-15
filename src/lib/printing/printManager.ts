import { Sale, Client, Shift, ShiftSummary } from '../../types';
import { formatCurrency } from '../salesService';
import { 
  isElectronApp, 
  printThermalReceiptNative, 
  openCashDrawerPulse, 
  PrintResult 
} from '../electronBridge';

export type PaperSize = '58mm' | '80mm' | 'a4';

export interface PrintJobOptions {
  paperSize?: PaperSize;
  silent?: boolean;
  printerName?: string;
  copies?: number;
}

export class POSPrintManager {
  /**
   * Generates clean, responsive HTML for thermal receipt (58mm / 80mm) or A4 format.
   */
  static buildReceiptHtml(sale: Sale, client?: Client | null, paperSize: PaperSize = '80mm'): string {
    const is58 = paperSize === '58mm';
    const isA4 = paperSize === 'a4';
    const storeName = client?.business_name || 'Ordexa POS Store';
    const vatNumber = (client as any)?.tax_number ? `الرقم الضريبي: ${(client as any).tax_number}` : '';
    const phone = client?.phone ? `الهاتف: ${client.phone}` : '';
    const address = client?.address || '';
    const dateFormatted = new Date(sale.created_at || Date.now()).toLocaleString('ar-SA');

    const widthStyle = is58 ? 'width: 58mm; max-width: 58mm;' : isA4 ? 'width: 210mm;' : 'width: 80mm; max-width: 80mm;';
    const fontSize = is58 ? '10px' : isA4 ? '13px' : '11px';

    return `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>فاتورة ${sale.invoice_number}</title>
        <style>
          @page {
            size: ${isA4 ? 'A4' : is58 ? '58mm auto' : '80mm auto'};
            margin: ${isA4 ? '15mm' : '2mm'};
          }
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif, system-ui;
            font-size: ${fontSize};
            line-height: 1.35;
            color: #000;
            background: #fff;
            margin: 0;
            padding: ${isA4 ? '0' : '4px'};
            direction: rtl;
          }
          .container {
            ${widthStyle}
            margin: 0 auto;
          }
          .text-center { text-align: center; }
          .text-left { text-align: left; }
          .text-right { text-align: right; }
          .bold { font-weight: bold; }
          .font-mono { font-family: monospace; }
          .divider { border-bottom: 1px dashed #000; margin: 6px 0; }
          .divider-solid { border-bottom: 1px solid #000; margin: 6px 0; }
          table { width: 100%; border-collapse: collapse; margin: 6px 0; }
          th { border-bottom: 1px solid #000; padding: 4px 2px; text-align: right; font-size: 0.9em; }
          td { padding: 4px 2px; vertical-align: top; }
          .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
          .barcode-box { text-align: center; margin-top: 8px; font-family: monospace; font-size: 11px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="text-center">
            ${client?.logo ? `<div style="margin-bottom: 6px;"><img src="${client.logo}" style="max-height: 48px; max-width: 140px; object-fit: contain;" /></div>` : ''}
            <h2 style="margin: 0 0 4px 0; font-size: ${is58 ? '14px' : '17px'};">${storeName}</h2>
            ${vatNumber ? `<div>${vatNumber}</div>` : ''}
            ${phone ? `<div>${phone}</div>` : ''}
            ${address ? `<div>${address}</div>` : ''}
            <div class="bold" style="margin-top: 4px; font-size: 1.1em;">فاتورة ضريبية مبسطة</div>
          </div>

          <div class="divider"></div>

          <div class="row">
            <span>رقم الفاتورة:</span>
            <span class="font-mono bold">${sale.invoice_number}</span>
          </div>
          <div class="row">
            <span>التاريخ:</span>
            <span class="font-mono">${dateFormatted}</span>
          </div>
          ${sale.warehouse ? `
          <div class="row">
            <span>الفرع / المستودع:</span>
            <span>${sale.warehouse.name}</span>
          </div>` : ''}
          ${sale.cashier ? `
          <div class="row">
            <span>الكاشير:</span>
            <span>${sale.cashier.name || (sale.cashier as any).full_name || 'الكاشير'}</span>
          </div>` : ''}

          <div class="divider-solid"></div>

          <table>
            <thead>
              <tr>
                <th style="width: 45%;">الصنف</th>
                <th style="width: 15%; text-align: center;">الكمية</th>
                <th style="width: 20%; text-align: center;">السعر</th>
                <th style="width: 20%; text-align: left;">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              ${(sale.items || []).map(item => `
                <tr>
                  <td>
                    <div class="bold">${item.product_name_snapshot}</div>
                    ${item.sku_snapshot ? `<div style="font-size: 9px; color: #555;">${item.sku_snapshot}</div>` : ''}
                  </td>
                  <td style="text-align: center;" class="font-mono">${item.quantity}</td>
                  <td style="text-align: center;" class="font-mono">${formatCurrency(item.unit_price, '')}</td>
                  <td style="text-align: left;" class="font-mono bold">${formatCurrency(item.line_total, '')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="divider-solid"></div>

          <div class="row">
            <span>المجموع الفرعي:</span>
            <span class="font-mono">${formatCurrency(sale.subtotal)}</span>
          </div>
          ${sale.discount_amount > 0 ? `
          <div class="row">
            <span>مجموع الخصم:</span>
            <span class="font-mono">- ${formatCurrency(sale.discount_amount)}</span>
          </div>` : ''}
          <div class="row">
            <span>ضريبة القيمة المضافة:</span>
            <span class="font-mono">${formatCurrency(sale.tax_amount)}</span>
          </div>
          <div class="row bold" style="font-size: 1.15em; border-top: 1px solid #000; padding-top: 4px; margin-top: 4px;">
            <span>المبلغ الإجمالي المطلوب:</span>
            <span class="font-mono">${formatCurrency(sale.total_amount)}</span>
          </div>

          <div class="divider"></div>

          <div class="row">
            <span>طريقة الدفع:</span>
            <span class="bold">
              ${(sale as any).payment_method === 'cash' || sale.payments?.[0]?.payment_method === 'cash' ? 'نقداً (Cash)' : 
                (sale as any).payment_method === 'card' || sale.payments?.[0]?.payment_method === 'card' ? 'بطاقة بنكية (Card)' : 
                sale.payments && sale.payments.length > 1 ? 'دفع مركب (Split)' : 'نقداً'}
            </span>
          </div>
          <div class="row">
            <span>المدفوع:</span>
            <span class="font-mono">${formatCurrency(sale.paid_amount)}</span>
          </div>
          ${sale.change_amount > 0 ? `
          <div class="row">
            <span>المتبقي للعميل:</span>
            <span class="font-mono bold">${formatCurrency(sale.change_amount)}</span>
          </div>` : ''}

          <div class="divider"></div>

          <div class="text-center barcode-box">
            <div>* ${sale.invoice_number} *</div>
            <div style="font-size: 9px; margin-top: 4px; color: #444;">شكراً لتسوقكم معنا!</div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generates clean HTML for Shift Z-Report.
   */
  static buildZReportHtml(shift: Shift | ShiftSummary, client?: Client | null, paperSize: PaperSize = '80mm'): string {
    const is58 = paperSize === '58mm';
    const s = shift as any;
    const storeName = client?.business_name || s.businessName || 'Ordexa POS Store';
    const cashierName = s.cashier_name || s.cashierName || s.opened_by_user?.name || s.cashier?.full_name || 'الكاشير';
    const openedAt = s.opened_at ? new Date(s.opened_at).toLocaleString('ar-SA') : '-';
    const closedAt = s.closed_at ? new Date(s.closed_at).toLocaleString('ar-SA') : (s.closedAt ? new Date(s.closedAt).toLocaleString('ar-SA') : new Date().toLocaleString('ar-SA'));

    return `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>Z-Report تقرير إغلاق الوردية</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif, system-ui;
            font-size: ${is58 ? '10px' : '11px'};
            line-height: 1.4;
            color: #000;
            background: #fff;
            margin: 0;
            padding: 4px;
            direction: rtl;
          }
          .container { width: ${is58 ? '58mm' : '80mm'}; margin: 0 auto; }
          .text-center { text-align: center; }
          .bold { font-weight: bold; }
          .font-mono { font-family: monospace; }
          .divider { border-bottom: 1px dashed #000; margin: 6px 0; }
          .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="text-center">
            <h2 style="margin: 0 0 2px 0; font-size: 15px;">${storeName}</h2>
            <div class="bold" style="font-size: 13px; margin: 4px 0;">تقرير الإغلاق المالي (Z-Report)</div>
            <div style="font-size: 10px;">معرف الوردية: <span class="font-mono">${s.id || s.shift_id || 'Z-REPORT'}</span></div>
          </div>

          <div class="divider"></div>

          <div><b>الكاشير:</b> ${cashierName}</div>
          <div><b>الفرع:</b> ${s.warehouse?.name || s.warehouse_name || 'الفرع الرئيسي'}</div>
          <div><b>بدء الوردية:</b> <span class="font-mono">${openedAt}</span></div>
          <div><b>إغلاق الوردية:</b> <span class="font-mono">${closedAt}</span></div>

          <div class="divider"></div>

          <div class="row">
            <span>الرصيد الافتتاحي:</span>
            <span class="font-mono bold">${formatCurrency(s.opening_cash || 0)}</span>
          </div>
          <div class="row">
            <span>إجمالي المبيعات:</span>
            <span class="font-mono bold">${formatCurrency(s.total_sales_amount || s.total_sales || 0)}</span>
          </div>
          <div class="row">
            <span>مبيعات النقد:</span>
            <span class="font-mono">${formatCurrency(s.total_cash_sales || s.cash_sales || 0)}</span>
          </div>
          <div class="row">
            <span>مبيعات الشبكة (البطاقات):</span>
            <span class="font-mono">${formatCurrency(s.total_card_sales || s.card_sales || 0)}</span>
          </div>
          <div class="row">
            <span>مبيعات أخرى:</span>
            <span class="font-mono">${formatCurrency(s.total_other_sales || s.other_payments || 0)}</span>
          </div>

          <div class="divider"></div>

          <div class="row">
            <span>إيداعات نقدية (+):</span>
            <span class="font-mono">${formatCurrency(s.total_cash_in || s.cash_in || 0)}</span>
          </div>
          <div class="row">
            <span>سحوبات ومصروفات (-):</span>
            <span class="font-mono">${formatCurrency(s.total_cash_out || s.cash_out || 0)}</span>
          </div>
          <div class="row">
            <span>مرتجعات نقدية (-):</span>
            <span class="font-mono">${formatCurrency(s.total_refunds_amount || s.refunds_amount || 0)}</span>
          </div>

          <div class="divider"></div>

          <div class="row bold" style="font-size: 1.1em;">
            <span>النقد المتوقع في الدرج:</span>
            <span class="font-mono">${formatCurrency(s.expected_cash || 0)}</span>
          </div>
          <div class="row bold" style="font-size: 1.1em;">
            <span>النقد الفعلي المسجل:</span>
            <span class="font-mono">${formatCurrency(s.closing_cash_actual || s.actual_cash || 0)}</span>
          </div>
          <div class="row bold">
            <span>الفارق (العجز / الزيادة):</span>
            <span class="font-mono">${formatCurrency(s.cash_difference || 0)}</span>
          </div>

          <div class="divider"></div>
          <div class="text-center" style="font-size: 10px; margin-top: 8px;">
            نهاية تقرير الوردية المالي • تم الإغلاق بنجاح
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Main print method for Sales invoices. Automatically routes to Electron native silent printing
   * or falls back to standard browser print modal.
   */
  static async printSale(sale: Sale, client?: Client | null, options?: PrintJobOptions): Promise<PrintResult> {
    const paperSize = options?.paperSize || '80mm';
    const html = this.buildReceiptHtml(sale, client, paperSize);

    if (isElectronApp()) {
      const printerName = options?.printerName || localStorage.getItem('ordexa_receipt_printer') || undefined;
      const res = await printThermalReceiptNative({
        html,
        printerName,
        silent: options?.silent ?? true,
        width: paperSize
      });
      return res;
    }

    // Web fallback
    this.printViaIframeOrWindow(html);
    return { success: true };
  }

  /**
   * Main print method for Z-Report shift closing. Supports both (shift, client, options) and (shift, options).
   */
  static async printZReport(
    shift: Shift | ShiftSummary, 
    clientOrOptions?: Client | null | any, 
    options?: PrintJobOptions
  ): Promise<PrintResult> {
    let client: Client | null = null;
    let opts: PrintJobOptions = options || {};

    if (clientOrOptions && ('business_name' in clientOrOptions || 'id' in clientOrOptions)) {
      client = clientOrOptions as Client;
    } else if (clientOrOptions) {
      opts = { ...clientOrOptions, ...options };
      if (clientOrOptions.businessName) {
        client = { business_name: clientOrOptions.businessName } as any;
      }
    }

    const paperSize = opts?.paperSize || '80mm';
    const html = this.buildZReportHtml(shift, client, paperSize);

    if (isElectronApp()) {
      const printerName = opts?.printerName || localStorage.getItem('ordexa_receipt_printer') || undefined;
      const res = await printThermalReceiptNative({
        html,
        printerName,
        silent: opts?.silent ?? true,
        width: paperSize
      });
      return res;
    }

    this.printViaIframeOrWindow(html);
    return { success: true };
  }

  /**
   * Web iframe / print window fallback helper.
   */
  private static printViaIframeOrWindow(html: string): void {
    try {
      const printIframe = document.createElement('iframe');
      printIframe.style.position = 'fixed';
      printIframe.style.right = '0';
      printIframe.style.bottom = '0';
      printIframe.style.width = '0';
      printIframe.style.height = '0';
      printIframe.style.border = '0';
      document.body.appendChild(printIframe);

      const iframeDoc = printIframe.contentDocument || printIframe.contentWindow?.document;
      if (iframeDoc) {
        iframeDoc.open();
        iframeDoc.write(html);
        iframeDoc.close();
        setTimeout(() => {
          printIframe.contentWindow?.focus();
          printIframe.contentWindow?.print();
          setTimeout(() => {
            document.body.removeChild(printIframe);
          }, 2000);
        }, 250);
      } else {
        window.print();
      }
    } catch {
      window.print();
    }
  }

  /**
   * Trigger cash drawer kick via ESC/POS pulse.
   */
  static async openCashDrawer(printerName?: string): Promise<{ success: boolean; message: string }> {
    const targetPrinter = printerName || localStorage.getItem('ordexa_receipt_printer') || undefined;
    return await openCashDrawerPulse(targetPrinter);
  }
}
