package com.liferpg.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public final class MainActivity extends Activity {
    private static final int REQUEST_CREATE_DOCUMENT = 4101;
    private static final int REQUEST_OPEN_DOCUMENT = 4102;

    private WebView webView;
    private ValueCallback<Uri[]> pendingFileCallback;
    private String pendingFileName;
    private String pendingMimeType;
    private String pendingFileContent;

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(11, 16, 32));
        getWindow().setNavigationBarColor(Color.rgb(11, 16, 32));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(11, 16, 32));

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setDefaultTextEncodingName("UTF-8");
        settings.setLoadsImagesAutomatically(true);

        // This bridge serves the bundled local app only.
        webView.addJavascriptInterface(new NativeBridge(), "NativeBridge");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView view,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams) {
                if (pendingFileCallback != null) {
                    pendingFileCallback.onReceiveValue(null);
                }
                pendingFileCallback = filePathCallback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                try {
                    startActivityForResult(intent, REQUEST_OPEN_DOCUMENT);
                    return true;
                } catch (ActivityNotFoundException error) {
                    pendingFileCallback = null;
                    filePathCallback.onReceiveValue(null);
                    Toast.makeText(MainActivity.this, "找不到可用的檔案選擇器", Toast.LENGTH_LONG).show();
                    return false;
                }
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("https://") || url.startsWith("http://")) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                    } catch (ActivityNotFoundException ignored) {
                        Toast.makeText(MainActivity.this, "找不到可開啟此連結的應用程式", Toast.LENGTH_SHORT).show();
                    }
                    return true;
                }
                return false;
            }
        });

        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
    }

    private final class NativeBridge {
        @JavascriptInterface
        public void saveFile(String fileName, String mimeType, String content) {
            pendingFileName = safeFilename(fileName);
            pendingMimeType = (mimeType == null || mimeType.trim().isEmpty())
                    ? "application/octet-stream" : mimeType;
            pendingFileContent = content == null ? "" : content;

            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(pendingMimeType);
                intent.putExtra(Intent.EXTRA_TITLE, pendingFileName);
                try {
                    startActivityForResult(intent, REQUEST_CREATE_DOCUMENT);
                } catch (ActivityNotFoundException error) {
                    clearPendingDownload();
                    Toast.makeText(MainActivity.this, "找不到可用的儲存位置", Toast.LENGTH_LONG).show();
                }
            });
        }
    }

    private String safeFilename(String name) {
        if (name == null || name.trim().isEmpty()) return "life-rpg-export.txt";
        return name.replace("/", "_").replace("\\", "_").replace(":", "_");
    }

    private void clearPendingDownload() {
        pendingFileName = null;
        pendingMimeType = null;
        pendingFileContent = null;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_OPEN_DOCUMENT) {
            Uri uri = (resultCode == RESULT_OK && data != null) ? data.getData() : null;
            if (pendingFileCallback != null) {
                pendingFileCallback.onReceiveValue(uri == null ? null : new Uri[]{uri});
                pendingFileCallback = null;
            }
            return;
        }
        if (requestCode == REQUEST_CREATE_DOCUMENT) {
            Uri uri = (resultCode == RESULT_OK && data != null) ? data.getData() : null;
            if (uri == null || pendingFileContent == null) {
                clearPendingDownload();
                return;
            }
            try (OutputStream output = getContentResolver().openOutputStream(uri, "w")) {
                if (output == null) throw new IllegalStateException("Unable to open output stream");
                output.write(pendingFileContent.getBytes(StandardCharsets.UTF_8));
                Toast.makeText(this, "已儲存匯出檔案", Toast.LENGTH_LONG).show();
            } catch (Exception error) {
                Toast.makeText(this, "儲存失敗，請再試一次", Toast.LENGTH_LONG).show();
            } finally {
                clearPendingDownload();
            }
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
