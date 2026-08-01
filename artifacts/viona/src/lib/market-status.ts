/** Market session calculator based on US Eastern Time.
 *  Robinhood Chain stock tokens follow NYSE/Nasdaq trading calendars.
 */

export type MarketSession = 'OPEN' | 'EXTENDED' | 'OVERNIGHT' | 'CLOSED';

export interface MarketStatus {
  session:     MarketSession;
  label:       string;
  color:       string;
  description: string;
  /** dot CSS class */
  dot:         string;
}

function toET(date: Date): Date {
  return new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

export function getMarketStatus(now: Date = new Date()): MarketStatus {
  const et = toET(now);
  const day = et.getDay();               // 0 Sun … 6 Sat
  const min = et.getHours() * 60 + et.getMinutes();

  const isWeekday = day >= 1 && day <= 5;

  if (!isWeekday) {
    return {
      session:     'CLOSED',
      label:       'MARKET CLOSED',
      color:       'hsl(var(--muted-foreground))',
      description: 'Weekend — markets open Monday 4:00 AM ET',
      dot:         't-dot-dim',
    };
  }

  // Regular hours: 9:30 AM – 4:00 PM ET
  const MARKET_OPEN  = 9  * 60 + 30;  // 570
  const MARKET_CLOSE = 16 * 60;        // 960

  // Extended hours: 4:00 AM – 9:30 AM  and  4:00 PM – 8:00 PM ET
  const PRE_START  = 4  * 60;          // 240
  const POST_END   = 20 * 60;          // 1200

  if (min >= MARKET_OPEN && min < MARKET_CLOSE) {
    return {
      session:     'OPEN',
      label:       'MARKET OPEN',
      color:       'hsl(var(--success))',
      description: 'Regular hours 9:30 AM – 4:00 PM ET',
      dot:         't-dot-green t-blink',
    };
  }

  if ((min >= PRE_START && min < MARKET_OPEN) || (min >= MARKET_CLOSE && min < POST_END)) {
    return {
      session:     'EXTENDED',
      label:       'EXTENDED HOURS',
      color:       '#FFB800',
      description: 'Pre/post market 4:00 AM – 9:30 AM / 4:00 PM – 8:00 PM ET',
      dot:         't-dot-yellow',
    };
  }

  return {
    session:     'OVERNIGHT',
    label:       'OVERNIGHT',
    color:       'rgb(120,180,255)',
    description: '24H tokens tradeable — regular market opens 9:30 AM ET',
    dot:         't-dot-blue',
  };
}

/** Returns true if the given tradingCapabilities supports the current session */
export function canTradeNow(
  caps: { market: boolean; extended: boolean; overnight: boolean } | null | undefined,
  status: MarketStatus,
): boolean {
  if (!caps) return status.session === 'OPEN';
  if (status.session === 'OPEN')      return caps.market;
  if (status.session === 'EXTENDED')  return caps.extended;
  if (status.session === 'OVERNIGHT') return caps.overnight;
  return false;
}
