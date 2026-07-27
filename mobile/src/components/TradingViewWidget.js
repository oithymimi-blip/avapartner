import { useEffect, useMemo, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'

const buildHtml = ({
  symbol,
  interval,
  theme,
  hideSideToolbar,
  hideTopToolbar,
  toolbarBg,
  backgroundColor,
  containerId,
  initialLines = []
}) => {
  const cleanSymbol = JSON.stringify(symbol ?? 'BINANCE:BTCUSDT')
  const cleanInterval = JSON.stringify(interval ?? '15')
  const cleanTheme = JSON.stringify(theme ?? 'light')
  const hideTop = hideTopToolbar ? 'true' : 'false'
  const hideSide = hideSideToolbar ? 'true' : 'false'
  const toolbarColor = JSON.stringify(toolbarBg ?? '#f4f5f7')
  const bgColor = JSON.stringify(backgroundColor ?? '#FFFFFF')
  const initialLinesLiteral = JSON.stringify(initialLines ?? [])

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    html, body {
      margin: 0;
      padding: 0;
      background: ${bgColor};
      height: 100%;
      width: 100%;
      overflow: hidden;
    }
    #${containerId} {
      width: 100%;
      height: 100%;
    }
  </style>
</head>
<body>
  <div id="${containerId}"></div>
  <script>
    (function () {
      let chartInstance = null;
      let orderLines = [];
      let pendingLines = ${initialLinesLiteral};

      const renderLines = (lines = []) => {
        if (!chartInstance) {
          pendingLines = lines;
          return;
        }
        orderLines.forEach(line => line && line.remove && line.remove());
        orderLines = [];
        (lines || []).slice(0, 16).forEach((line) => {
          if (!line || typeof line.price === 'undefined') return;
          let created = null;
          if (typeof chartInstance.createShape === 'function') {
            try {
              const shape = chartInstance.createShape(
                { price: Number(line.price) || 0, shape: 'horizontal_line', text: '' },
                { disableSelection: true, disableSave: true }
              );
              if (shape.setText) shape.setText('');
              if (shape.setLineColor) shape.setLineColor(String(line.color || '#4B5563'));
              if (shape.setTextColor) shape.setTextColor('#FFFFFF');
              if (shape.setProperties) {
                shape.setProperties({
                  linewidth: 2,
                  showLabel: false,
                  showPrice: false,
                  textcolor: '#FFFFFF',
                  color: line.color || '#4B5563'
                });
              }
              created = shape;
            } catch (err) {
              // ignore
            }
          }
          if (!created && typeof chartInstance.createOrderLine === 'function') {
            const ol = chartInstance.createOrderLine({ disableUndo: true });
            if (ol.setPrice) ol.setPrice(Number(line.price) || 0);
            if (line.color && ol.setLineColor) ol.setLineColor(String(line.color));
            if (ol.setExtendLeft) ol.setExtendLeft(true);
            if (ol.setExtendRight) ol.setExtendRight(true);
            if (ol.setLineStyle) ol.setLineStyle(0);
            if (ol.setShowLabel) ol.setShowLabel(false);
            if (ol.setShowPrice) ol.setShowPrice(false);
            created = ol;
          }
          if (created) orderLines.push(created);
        });
        pendingLines = lines;
      };

      const handleMessage = (event) => {
        try {
          const payload = JSON.parse(event.data || '{}');
          if (payload.type === 'priceLines') {
            renderLines(payload.lines || []);
          }
        } catch (err) {
          // ignore
        }
      };
      document.addEventListener('message', handleMessage);
      window.addEventListener('message', handleMessage);

      const createWidget = () => {
        const container = document.getElementById('${containerId}')
        if (!container || container.dataset.initialized === 'true') {
          return
        }
        const widget = new TradingView.widget({
          autosize: true,
          symbol: ${cleanSymbol},
          interval: ${cleanInterval},
          timezone: 'Etc/UTC',
          theme: ${cleanTheme},
          style: 1,
          toolbar_bg: ${toolbarColor},
          hide_side_toolbar: ${hideSide},
          hide_top_toolbar: ${hideTop},
          enable_publishing: false,
          allow_symbol_change: true,
          withdateranges: true,
          container_id: '${containerId}'
        })
        container.dataset.initialized = 'true'
        widget.onChartReady(() => {
          chartInstance = widget.activeChart && widget.activeChart()
          renderLines(pendingLines.length ? pendingLines : ${initialLinesLiteral})
        })
      }

      const loadScript = () => {
        if (typeof TradingView !== 'undefined') {
          createWidget()
          return
        }
        const existing = document.querySelector('script[src="https://s3.tradingview.com/tv.js"]')
        if (existing) {
          existing.addEventListener('load', createWidget)
          return
        }
        const script = document.createElement('script')
        script.src = 'https://s3.tradingview.com/tv.js'
        script.onload = createWidget
        script.onerror = () => setTimeout(loadScript, 200)
        document.head.appendChild(script)
      }

      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        loadScript()
      } else {
        window.addEventListener('DOMContentLoaded', loadScript)
      }
    })()
  </script>
</body>
</html>`
}

export function TradingViewWidget({
  symbol = 'BINANCE:BTCUSDT',
  interval = '15',
  height = 320,
  theme = 'light',
  hideTopToolbar = true,
  hideSideToolbar = true,
  toolbarBg = '#F7F9FB',
  backgroundColor = '#FFFFFF',
  priceLines = []
}) {
  const containerId = useMemo(() => `tradingview-${Math.random().toString(36).slice(2, 9)}`, [])
  const html = useMemo(
    () => buildHtml({
      symbol,
      interval,
      theme,
      hideTopToolbar,
      hideSideToolbar,
      toolbarBg,
      backgroundColor,
      containerId,
      initialLines: normalizedLines
    }),
    [symbol, interval, theme, hideTopToolbar, hideSideToolbar, toolbarBg, backgroundColor, containerId, normalizedLines]
  )
  const webRef = useMemo(() => ({ current: null }), [])
  const lastPayloadRef = useRef('')

  const normalizedLines = useMemo(() => {
    return (priceLines || []).map(line => ({
      price: Number(line.price),
      label: line.label,
      color: line.color,
      textColor: line.textColor || '#FFFFFF',
      extendLeft: true,
      extendRight: true,
      dashed: false,
      tooltip: line.tooltip,
      isLive: line.isLive
    }))
  }, [priceLines])

  useEffect(() => {
    const payload = JSON.stringify({ type: 'priceLines', lines: normalizedLines })
    lastPayloadRef.current = payload
    const encoded = JSON.stringify(payload)
    const inject = () => webRef.current?.injectJavaScript?.(
      `(function(){try{window.dispatchEvent(new MessageEvent('message',{data:${encoded}}));}catch(e){}})();true;`
    )
    inject()
    const t1 = setTimeout(inject, 300)
    const t2 = setTimeout(inject, 900)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [normalizedLines])

  const handleLoadEnd = () => {
    if (!lastPayloadRef.current) return
    const encoded = JSON.stringify(lastPayloadRef.current)
    webRef.current?.injectJavaScript?.(
      `(function(){try{window.dispatchEvent(new MessageEvent('message',{data:${encoded}}));}catch(e){}})();true;`
    )
  }

  return (
    <View style={[styles.wrapper, { height, backgroundColor }]}>
      <WebView
        ref={ref => { webRef.current = ref }}
        originWhitelist={['*']}
        source={{ html }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        automaticallyAdjustContentInsets={false}
        onLoadEnd={handleLoadEnd}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E9F0'
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent'
  }
})
