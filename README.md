# Spor Okulu Sezon Paneli

GitHub Pages üzerinde çalışan, Google Sheets ve Drive ile entegre sezon/takım takip uygulaması. Arayüz HTML5, CSS3 ve saf JavaScript ile hazırlanmıştır; derleme adımı gerektirmez.

## Özellikler

- Sezon özeti, takım kartları ve takım detay sayfaları
- Sporcu kadrosu, fotoğraflar, antrenör ve lig bilgileri
- Google Sheets'ten otomatik fikstür, maç günü ve sonuç okuma
- Panelden takım, sporcu, antrenör ve maç katılımı kaydetme
- Görselleri Google Drive klasörüne yükleme
- Mobil menü ve responsive kart/tablo düzeni
- Maç, fikstür ve sonuç için panelde yazma uç noktası yoktur

## Google Drive kurulumu

1. [script.google.com](https://script.google.com) üzerinde yeni proje oluşturun.
2. `apps-script/Code.gs` içeriğini editöre kopyalayın. Proje ayarlarında manifest görünümünü açıp `appsscript.json` içeriğini ekleyin.
3. Editörde `setup()` fonksiyonunu bir kez çalıştırın ve Drive/Sheets izinlerini onaylayın. Fonksiyon, bir çalışma kitabı ile görsel klasörü oluşturur.
4. **Dağıt > Yeni dağıtım > Web uygulaması** seçin. Yürüten: siz; erişim: bağlantıya sahip herkes.
5. Dağıtım URL'sini `assets/config.js` içindeki `API_URL` alanına yazın.

### Gerçek fikstür kaynağı

Uygulama, `Voleybol Day İstanbul adlı dosyanın kopyası` çalışma kitabını (`1-LJHnabJcec-0v2UnHCMhZgu3oFx67QOfhkCLntbrsI`) salt okunur lig kaynağı olarak kullanır. Apps Script çalıştıran Google hesabının bu dosyaya erişimi olmalıdır.

Yerel ön izleme ve Apps Script kurulmadan yapılan GitHub Pages testi için `data/google-sheets-snapshot.js` gerçek verinin salt okunur anlık görüntüsünü içerir. Uygulama açılış sırası:

1. Gerçek Google Sheets anlık görüntüsü gösterilir.
2. `API_URL` tanımlıysa Apps Script'ten canlı veri istenir.
3. Canlı istek başarılı olursa anlık görüntü otomatik olarak canlı veriyle değiştirilir.

- `Sayfa1`: birincil maç ve sonuç kaynağı
- `Eksik Maçlar`: yalnızca ana sekmede bulunmayan maçları tamamlayan ikincil kaynak
- Takım/grup anahtarı: `Küme | Ktg | Tür | Gr`
- Kulüp filtresi: ev sahibi veya misafir adında `Dev Ataşehir`

`Eksik Maçlar` sekmesinde veri satırlarının B ve C sütunları görünür başlıktan farklı olarak sırasıyla **Saat** ve **Salon** içerir. Entegrasyon bu farkı özel olarak düzeltir. Aynı maç iki sekmede bulunursa `Sayfa1` kaydı kullanılır.

### Takım ve sporcu kadro kaynağı

`TAKIM MEVKİ adlı dosyanın kopyası` (`1TIssy6VRqYMLGtU3Usd4aR7V44ilMDmlGPfDuvJhOOY`) ikinci salt okunur kaynaktır. Dosyalara veri yazılmaz; iki kaynak yalnızca web uygulamasında `Grup Adı` ile maç kaynağındaki `Küme | Ktg | Tür | Gr` anahtarı eşleştirilerek birleştirilir.

Kadro dosyasındaki tekrar eden başlıklar ve “AD / mevki” yer tutucuları atlanır. Takım adı, grup ve antrenör bilgisi blok başından alt oyuncu satırlarına taşınır.

Oluşturulan çalışma kitabındaki sekmeler: `teams`, `athletes`, `coaches`, `leagues`, `matches`, `attendance`. İlk satır başlıklarını değiştirmeyin. `matches` sayfası maç günleri, fikstür ve sonuçlar için dış veri kaynağıdır ve web panelinden değiştirilemez.

Maç durumu için `status` hücresinde `upcoming` veya `completed`, sonuç için `score` hücresinde örneğin `3 - 1` kullanın. Tarih değeri ISO biçiminde (`2026-09-18T14:00:00`) önerilir.

## GitHub Pages yayını

Bu klasörü GitHub deposuna gönderin. Depoda **Settings > Pages > Deploy from a branch** seçip ana dalı ve `/ (root)` klasörünü belirleyin. Uygulama, `index.html` üzerinden doğrudan çalışır.

## Tema

Kulüp adı, sezon ve renkler `assets/config.js` dosyasındaki `CLUB_NAME`, `SEASON` ve `THEME` alanlarından değiştirilebilir.

## Güvenlik notu

GitHub Pages statik olduğu için yönetici kimlik doğrulamasını tek başına güvenli biçimde sağlayamaz. Apps Script dağıtımı `ANYONE_ANONYMOUS` olarak bırakılırsa URL'yi bilen biri yazma isteği gönderebilir. Canlı kullanımda Google Workspace hesabıyla erişim sınırı, Apps Script tarafında kullanıcı doğrulaması veya ayrı bir kimlik doğrulamalı API katmanı önerilir.
