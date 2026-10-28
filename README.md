# Bãi Gia Công

Ứng dụng web (PWA) quản lý tồn kho thép bê tông cốt thép D6 → D36 trên bãi, chạy hoàn toàn trên Cloudflare (gói miễn phí): **Workers + D1 + Static Assets**. Không cần VPS.

## Cách hệ thống tính

- **Mỗi người chỉ thấy thẻ nhắc về việc của mình** — việc mình phải làm, việc mình có quyền làm, hoặc tin về chính báo cáo / phiếu mình đã gửi:
  - **Tiểu đội trưởng**: khu mình đếm được *chưa báo* hoặc *chưa đếm buổi…*, báo cáo của mình *bị huỷ* (bấm là mở màn đếm) hoặc *đang chờ duyệt*, hai người báo khác số ở khu mình. Không thấy phiếu kho, cảnh báo tồn, việc của người khác.
  - **CVKTHT** (quản lý việc đếm cả bãi): mọi khu *chưa báo* (kèm tên người phụ trách để biết nhắc ai), *thiếu buổi*, *chưa đếm buổi đang diễn ra*, báo cáo bị huỷ đang chờ báo lại; *khu chờ bạn duyệt* và *lần ghi vay mượn chờ bạn duyệt* — chỉ những cái mình duyệt được; phiếu và báo cáo **của mình** đang chờ cấp trên; tồn thấp, vay mượn quá hạn.
  - **Trung đội trưởng, Đại đội trưởng**: mọi thứ chờ duyệt (họ duyệt được hết: khu, phiếu kho, sổ vay), khu *cần xem lại* (phiếu kho duyệt/huỷ sau khi số của khu đã duyệt — chỉ cấp 2 duyệt lại được), tồn thấp, vay mượn quá hạn. Không bị nhắc việc đếm — đó là việc của CVKTHT.
  - **Admin**: như cấp chỉ huy, cộng việc hệ thống: *N khu chưa giao người phụ trách* (khu chưa giao ai thì Tiểu đội trưởng nào cũng được nhắc đếm), đi giao ở **Cài đặt → Khu bãi**.
  - Ở màn **Duyệt**, con số *Còn N việc cần xử lý* cũng chỉ đếm việc người xem làm được; hết việc của mình mà cấp trên còn việc thì màn hình nói *Không còn việc của bạn*.
  - Khu trống (không có thép, không có phiếu) không bị nhắc. App chỉ nhắc khi người đó **mở app** — chưa có thông báo đẩy.
- **Báo cáo: chọn khu trước.** Bấm tab **Báo cáo** là ra **màn chọn khu**, không tự mở khu lần trước, để không ai báo nhầm khu. Mỗi thẻ khu ghi trạng thái hôm nay (chưa báo, chờ duyệt, bị huỷ, thiếu buổi…), ai báo lúc nào, và việc dở dang của chính người cầm máy: *đang đếm dở N phi*, *có báo cáo chưa gửi được* (mất mạng). Khu còn việc xếp trước, khu đã xong xếp sau. Chạm khu mới vào bảng đếm của khu đó; nút Back trên bảng đếm về lại danh sách khu, gửi xong cũng về đó để chọn khu tiếp. Thẻ nhắc ở Tổng quan và nút *Báo cáo khu X* vẫn mở thẳng đúng khu.
- **Tổng quan**: chạm vào thẻ một khu để xem thép của khu đó với **đủ mọi đường kính** (phi không có thép ghi 0), và bấm **Đếm / báo cáo** ngay ở đó (chỉ hiện với người đếm được khu đó, khi ngày chưa chốt).
- Mỗi ô **(ngày × khu × phi)** là đơn vị gốc. Mọi thống kê (toàn bãi, theo khu, theo phi) tính từ các ô này.
- Hằng ngày mỗi khu báo số đếm thực tế (bó + cây lẻ). **Mọi khu luôn hiện đủ phi D6 → D36**; phi khu không có thì cứ **để trống**, hệ thống hiểu là 0. Không phải gõ 0 cho chín phi không có.
- **Chưa duyệt thì không vào tồn.** Đây là quy tắc trung tâm, áp cho cả báo cáo đếm lẫn phiếu nhập/chuyển: tồn của một khu luôn bằng **báo cáo mới nhất ĐƯỢC DUYỆT** của khu đó, không liên quan khu khác. Khu báo lại số mới mà chưa ai duyệt thì tồn vẫn là số đã duyệt trước đó.
- **Đã dùng = Tồn chuẩn hôm qua + Nhập trong ngày − Tổng đếm hôm nay** (tính ở cấp toàn bãi, **không ai phải nhập phiếu xuất**). Muốn biết thép đi đâu thì ghi **phiếu xuất** — tuỳ chọn, không bắt buộc, và nó **không thay phép tính này**, chỉ tách con số "đã dùng" thành phần *có phiếu* và phần *không rõ*. Xem mục [Phiếu xuất](#phiếu-xuất-tuỳ-chọn). Vế "Tổng đếm" là **thép đang có**: báo cáo đã duyệt gần nhất của từng khu, cộng phiếu được duyệt **sau** lần duyệt đó (thép về mà khu chưa báo lại không bị tính là đã dùng). Phiếu lập trước lúc đếm và duyệt trước hoặc cùng lúc với báo cáo thì không cộng — duyệt báo cáo là lấy tồn theo báo cáo — nên không tính trùng với vế "Nhập".
- **Thép đang có** của một khu = số đếm đã duyệt gần nhất **+ phiếu đã duyệt sau lần đếm đó**. Đã duyệt thì phải vào tồn, nên một khu vừa nhận thép đã duyệt mà chưa kịp đếm vẫn thấy ngay ở Tổng quan và Tồn bãi, khớp với số "dự kiến" mà màn Báo cáo đang hiện. **Duyệt báo cáo của khu là lấy tồn khu đó theo báo cáo**: phiếu **lập trước lúc khu đếm** và đã duyệt trước đó (hoặc được duyệt kèm trong cùng lần bấm Duyệt khu) coi như đã nằm trong số báo cáo. Phiếu **lập sau lúc đếm** thì số đếm không thể gồm nó, nên duyệt lúc nào cũng **cộng lên trên** số báo cáo — kể cả khi duyệt chung một lần bấm, và kể cả khi báo cáo chưa duyệt được chuyển qua 0h rồi hôm sau mới duyệt (ví dụ: đếm 100 lúc 8h, 10h chuyển 90 sang khu B, 11h duyệt khu A cả số lẫn phiếu → A còn 10, B 90, cả bãi vẫn 100). Huỷ một phiếu đã duyệt mà khu đã đếm lại sau đó (phiếu đã nằm trong số đếm) thì không đòi khu còn đủ thép: huỷ chỉ sửa cột nhập / đã dùng, không đổi tồn. Mọi chỗ đọc tồn đều theo đúng quy tắc này: Tổng quan, Tồn bãi, màn Duyệt, chốt chặn rút thép (chuyển khu, xuất, điều chỉnh giảm, cho mượn), kiểm tra trước khi ẩn khu/phi, **tệp xuất CSV, màn Xem lại ngày cũ**, và **tồn chuẩn lúc sổ tự chốt** — thép đã duyệt mà khu chưa báo lại vẫn nằm trong tồn chuẩn của ngày sau.
- **Duyệt theo từng khu, độc lập.** Màn Duyệt bày cho mỗi khu một bảng *dự kiến → khu báo → lệch*, rồi người duyệt bấm **Duyệt khu**. Lệch to hay nhỏ chỉ đổi màu chữ để dễ thấy, **không** quyết định khu có duyệt được hay không — khu nào đã báo cũng duyệt được. Duyệt khu nào thì duyệt luôn phiếu đang chờ của khu đó, trong cùng một lần ghi.
- **Báo cáo sai thì người duyệt HUỶ, kèm lý do.** Ở màn Duyệt, mỗi báo cáo đang chờ duyệt có nút **Huỷ báo cáo**; bấm thì phải gõ lý do (ví dụ *"D16 đếm thiếu 2 bó"*). Huỷ là gỡ hẳn: số đó **không còn chờ duyệt**, không duyệt được nữa, không vào tồn, và khu **trở về chưa báo**. Người gửi thấy thẻ đỏ *"Báo cáo … của bạn đã bị huỷ"* kèm **lý do** và tên người huỷ ở Tổng quan và ngay trên màn đếm, cho tới khi khu báo lại; bảng đếm không điền sẵn số bị huỷ. Lý do và số bị huỷ nằm trong nhật ký. Nếu khu đã có một lần báo **được duyệt** trước đó trong ngày thì ô quay về đúng lần đó — tồn không đổi. Báo cáo **đã duyệt** thì không huỷ được (số đã là tồn): để khu báo lại, hoặc lập phiếu Điều chỉnh tồn. Báo cáo bị huỷ không tính là đã đếm buổi đó, và không chuyển sang ngày sau.
- Người duyệt vẫn được nhắc riêng những việc không duyệt được bằng một nút: khu chưa báo (kể cả khu vừa bị huỷ báo cáo), hai người báo khác số, phi dùng âm hoặc dùng quá 3 lần mức bình thường.
- **Để trống phi đang có thép** thì app hỏi lại ngay lúc gửi (*"gửi là ghi 0, đúng chưa?"*), và màn Duyệt đánh dấu riêng ô đó cho người duyệt thấy. Phi dự kiến đang 0 mà để trống thì không hỏi gì.
- **Sổ ngày tự chốt sau nửa đêm — không có nút chốt.** Người duyệt chỉ việc duyệt. Ngay sau 0h, số **đã duyệt** của ngày hôm trước trở thành **tồn chuẩn** cho ngày sau, ngày đó được khoá. Xem mục [Sổ ngày tự chốt](#sổ-ngày-tự-chốt).
- **Đếm nhiều lần/ngày (tuỳ chọn, bắt buộc khi bật)**: admin đặt mỗi khu phải đếm 1–4 lần/ngày. Từ 2 lần trở lên, khung giờ đã qua mà khu chưa đếm là một việc chưa xử lý và được ghi vào nhật ký lúc sổ tự chốt. Xem mục [Đếm nhiều lần mỗi ngày](#đếm-nhiều-lần-mỗi-ngày).
- **Số tấn của ngày đã chốt được khoá.** Lúc chốt, app lưu kg/cây của từng phi; báo cáo kỳ, Xem lại ngày cũ, Thống kê và tệp CSV ngày cũ nhân với số đó. Sửa kg/cây ở Cài đặt chỉ có tác dụng từ ngày chưa chốt trở đi, không viết lại số tấn của quá khứ.
- Mất mạng khi gửi báo cáo: app lưu báo cáo kèm **ngày đếm** và tự gửi lại khi có mạng. Nếu đã sang ngày mới, báo cáo hiện ở Tổng quan để người dùng chọn *Gửi làm số hôm nay* hoặc *Bỏ*, không tự ghi vào sai ngày.
- **Nhiều người dùng chung một điện thoại**: báo cáo chờ gửi và nháp đếm dở gắn với **từng người**. App chỉ tự gửi báo cáo của người đang đăng nhập; báo cáo của người khác nằm chờ chính người đó đăng nhập lại, không bị gửi dưới tên người khác và người khác cũng không bỏ được.
- **Nhập kho** một phiếu được nhiều phi, có hộp xác nhận trước khi lưu. Mọi nút lưu đều bị khoá trong lúc đang gửi nên bấm đúp không tạo phiếu trùng.
- **Mọi phiếu đều chờ cấp chỉ huy duyệt**, kể cả phiếu cấp chỉ huy tự nhập. Phiếu ghi **cả ngày nhập và ngày duyệt**, và tính vào tồn theo **ngày duyệt**: thép về chiều ngày 7 duyệt sáng ngày 8 thì nằm trong số liệu ngày 8, chứng từ vẫn ghi đủ hai mốc. Nhờ vậy phiếu treo qua đêm không cần chặn chốt ngày.
- Người lập **rút lại** phiếu chưa duyệt bất cứ lúc nào; phiếu đã duyệt thì chỉ hoàn tác được trong 10 phút kể từ **lúc duyệt**, sau đó nhờ cấp chỉ huy. Cấp chỉ huy **từ chối** phiếu chờ duyệt, hoặc **huỷ** phiếu đã duyệt cho tới khi sổ của ngày duyệt tự chốt (sau 0h).
- **Chuyển khu** (Nhập → Chuyển khu): ghi một dòng âm ở khu đi, một dòng dương ở khu đến. Tổng toàn bãi không đổi nên lượng dùng không bị ảnh hưởng.
- **Điều chỉnh tồn** (Nhập → Điều chỉnh): sửa tồn một ô (khu × phi) khi **sổ sai** mà không phiếu nào giải thích được. Bắt buộc chọn **lý do**, phải **cấp chỉ huy duyệt** mới vào tồn, và **không giảm quá số khu đang thực có**. Xem mục [Điều chỉnh tồn](#điều-chỉnh-tồn) bên dưới.
- Bấm **Hết (0)** trên phi **đang có thép** thì app hỏi lại (nút này nằm sát nút TIẾP, bấm nhầm là ghi 0 cho phi còn thép).
- Khi đếm, ô chưa chạm tới hiện dấu **—** kèm chữ *"sẽ ghi 0"* và số dự kiến làm tham chiếu (= tồn đã duyệt hôm qua + phiếu đã duyệt). Muốn lấy nguyên số hôm qua thì bấm **Giữ nguyên**, không phải cứ bỏ trống. Phi có thép nhập/chuyển từ lần chốt trước **không được "giữ nguyên"**, bắt buộc đếm thực tế.
- **Mở lại màn đếm**: bảng chỉ điền sẵn số khu đã gửi **hôm nay, trong khung giờ đang diễn ra** (để sửa lại lần báo vừa rồi). Báo cáo hôm qua chưa duyệt và số của khung giờ trước **không** điền sẵn, thông báo trên màn ghi rõ ngày của số đang chờ duyệt: điền sẵn thì chỉ cần bấm Gửi là số cũ thành lần đếm mới, và thép duyệt vào sau lần đếm cũ biến mất khỏi sổ. Chạm vào một ô đã có số rồi bấm Tiếp hay Đóng mà **không gõ gì** thì ô giữ nguyên như cũ, kể cả loại của nó: ô *giữ nguyên* không thành *đếm thật*, ô *để trống* không thành *Hết (0)*. Lúc gửi, ô để trống có sẵn từ lần báo trước cũng được hỏi lại như ô chưa chạm. Số điền sẵn cũng không đi theo sang khung giờ sau qua nháp lưu trên máy hay qua màn đếm để mở: sang khung mới là các ô đó trở về *chưa đếm* (ô người đếm tự gõ thì vẫn giữ). **Giữ nguyên** chỉ được nhận khi con số đúng bằng số đã duyệt gần nhất; số đó đổi sau lúc bấm nút (người duyệt vừa duyệt báo cáo khác) thì server từ chối và ô trở về *chưa đếm* để xem lại.
- Nếu một phiếu được duyệt **sau khi** số của khu đã duyệt, số dự kiến của khu đổi mà số đã duyệt thì không: màn Duyệt nhắc *xem lại khu đó*. Duyệt lại khu là hết nhắc. Khi 2 người báo khác số, người duyệt xem **hai số cạnh nhau** và chọn từng phi — chọn số xong vẫn phải bấm Duyệt khu, vì chọn số không phải là duyệt số.
- Không ẩn được khu còn thép (phải chuyển đi hoặc đếm về 0 trước).
- **Xem lại ngày cũ**, **báo cáo Nhập – Dùng – Tồn theo kỳ** (xuất CSV, có **cột Điều chỉnh** riêng khi kỳ đó có sửa sổ), và **dự báo số ngày còn đủ dùng** từng phi (theo lượng dùng trung bình 28 ngày). Kỳ nào có phiếu xuất thì bảng thêm **cột "Có phiếu"** — phần lượng dùng đã giải thích được.
- Nhật ký hoạt động và lịch sử đếm chỉ ghi thêm (database từ chối sửa/xoá).
- **Thống kê báo cáo (ai báo, ai không báo)** nằm ngay trong màn **Nhật ký hoạt động**, mục *Thống kê báo cáo* (Thêm → Nhật ký hoạt động): chọn 7, 30 hoặc 90 ngày, một dòng tóm tắt bao nhiêu người và bao nhiêu khu thiếu buổi, rồi một bảng theo người và một bảng theo khu. Mỗi dòng có nhãn *Đủ* hoặc *Thiếu N buổi*; chạm dòng thiếu để xem từng ngày. Chỉ tính các ngày đã chốt.

### Vai trò và cấp duyệt

Vai trò đặt theo chức danh thật, và việc duyệt đi theo cấp bậc. Trong tài liệu này, *người duyệt* là người đủ cấp duyệt việc đó theo bảng dưới, *cấp chỉ huy* là cấp 2 (Trung đội trưởng, Đại đội trưởng, Admin), còn *Admin* chỉ người quản lý hệ thống.

| Vai trò | Cấp duyệt | Làm được |
|---|---|---|
| **Tiểu đội trưởng** (trước là *Người đếm*) | 0 | Đếm và báo số khu mình phụ trách, ghi sổ vay mượn (chỉ ghi sổ), xem số liệu |
| **CVKTHT** (admin cấp 3) | 1 | Đếm, **lập phiếu kho** (nhập / chuyển / xuất / điều chỉnh), và **duyệt việc Tiểu đội trưởng báo**: báo cáo đếm, sổ vay mượn chỉ ghi sổ. Có tab Duyệt, xem Nhật ký và Thống kê báo cáo |
| **Trung đội trưởng** (admin cấp 2) | 2 | **Duyệt được hết**: việc CVKTHT báo và mọi phiếu kho. Đếm được mọi khu |
| **Đại đội trưởng** (admin cấp 1) | 2 | Ngang Trung đội trưởng |
| **Admin** (người quản lý app) | 2 | Duyệt được hết, **và quản lý hệ thống**: tài khoản và PIN, khu và phân công, phi, quy tắc, dữ liệu |

- **Phiếu kho chỉ Trung đội trưởng, Đại đội trưởng, Admin duyệt**, ai lập cũng vậy. CVKTHT lập được phiếu nhưng không duyệt phiếu nào. Lần ghi vay mượn có kèm phiếu kho cũng theo luật này.
- **Việc mình báo thì cấp mình không tự duyệt** (áp cho CVKTHT): số đếm hay lần ghi sổ do một CVKTHT báo thì CVKTHT đó và các CVKTHT khác đều không duyệt được, phải lên cấp 2. Cấp 2 thì duyệt được cả việc của mình, như admin trước đây. Dưới cấp 2 thì **không ai duyệt việc của chính mình**, kể cả việc báo lúc còn ở cấp dưới (Tiểu đội trưởng báo số rồi được nâng lên CVKTHT vẫn không tự duyệt được số đó; CVKTHT khác thì duyệt được).
- **Duyệt khu là duyệt cả số đếm lẫn phiếu chờ của khu** trong một lần ghi, nên CVKTHT chỉ duyệt được khu mà số đếm do Tiểu đội trưởng báo **và không còn phiếu kho nào chờ**. Khu còn phiếu kho chờ thì cả khu chờ cấp 2; màn Duyệt ghi rõ đang chờ ai. *Duyệt tất cả* của CVKTHT chỉ duyệt các khu duyệt được, phần còn lại vẫn chờ. Cũng vậy khi khu **đếm trước lúc một phiếu kho được duyệt hoặc huỷ** (kể cả khu *cần xem lại*): duyệt số đó là lấy tồn theo số đếm, tức coi như phiếu đã nằm sẵn trong số — một quyết định về phiếu kho, nên chỉ cấp 2 làm được; khu đếm lại thì CVKTHT duyệt được.
- **Hai người báo khác số**: ai *chọn số* thì số đó là của người chọn. CVKTHT chọn số xong thì khu chờ cấp 2 duyệt.
- **Ai duyệt được thì cũng từ chối / huỷ được** (phiếu, lần ghi sổ, báo cáo đếm đang chờ). Người lập vẫn rút lại việc của mình như cũ.
- **Phần hệ thống chỉ vai trò Admin**, kể cả Đại đội trưởng cũng không vào được: Người dùng và PIN, Cài đặt (khu, phân công, phi, quy tắc), đặt lại / sao lưu / nạp lại dữ liệu.
- **Giao khu chỉ giao cho Tiểu đội trưởng**, để mỗi người giữ bãi của mình và không báo nhầm khu của nhau: khu đã giao thì trong hàng Tiểu đội trưởng chỉ người được giao đếm được. **CVKTHT trở lên quản lý chung cả bãi**, đếm và báo cáo được mọi khu mà không cần giao. Vì vậy lời nhắc *"khu … chưa đếm buổi …"* (khung đang diễn ra) gửi cho Tiểu đội trưởng theo khu được giao và gửi cho CVKTHT **cả bãi**; cấp 2 không nhận lời nhắc này mà thấy khu thiếu buổi sau khi khung đã hết.
- **Cấp của người báo được ghi vào số liệu ngay lúc báo.** Đổi vai trò một người không làm đổi việc ai duyệt được những thứ họ đã báo: số một CVKTHT báo vẫn cần cấp 2 duyệt dù sau đó người ấy xuống làm Tiểu đội trưởng. Từ lần báo sau họ mới báo với cấp mới.
- **Thôi là Tiểu đội trưởng thì thôi phụ trách khu.** Đổi vai trò một Tiểu đội trưởng lên cấp khác (hoặc xoá tài khoản) là gỡ người đó khỏi mọi khu đang phụ trách; nếu có khu chỉ còn mỗi người đó thì app hỏi lại trước, vì khu đó sẽ thành chưa giao ai.
- **Khi nâng cấp từ bản cũ** (tự động ở lần chạy đầu sau deploy): *Người đếm* thành *Tiểu đội trưởng*; vai trò *Thủ kho* đã bỏ, tài khoản thủ kho thành **CVKTHT** và bị gỡ khỏi các khu đang phụ trách; mọi tài khoản admin vẫn là Admin. Admin đầu tiên vào **Người dùng và PIN** xếp lại từng người cho đúng cấp. **Bản sao (JSON) tải từ trước bản này không nạp lại được nữa.**

### Tài khoản và tên người làm

- **Tên đi theo mọi hoạt động.** Số đếm, phiếu, báo cáo khu và lần chốt ngày đều hiện tên người làm, nên khi tạo tài khoản hãy đặt **đúng họ tên**, đừng đặt theo chức danh — một tài khoản tên "admin" sẽ ghi "admin" lên mọi thứ và sau này không ai biết người thật là ai.
- **Sửa được tên** nếu đặt sai. Số đếm, phiếu, báo cáo khu và tên người duyệt hiện tên mới **ngay**, kể cả dữ liệu cũ. Riêng **nhật ký** thì các dòng trước khi đổi vẫn mang tên cũ: nhật ký lưu sẵn tên vào từng dòng và database từ chối mọi lệnh sửa, cố ý như vậy để nhật ký không viết lại được. Chính dòng *"đổi tên X thành Y"* trong nhật ký là cái nối hai tên lại.
- **Xoá tài khoản**: người đó không đăng nhập được nữa, bị đăng xuất khỏi mọi máy và bỏ khỏi phân công khu. **Mọi số đếm, phiếu và báo cáo họ đã làm vẫn giữ nguyên, vẫn mang tên họ** — nên hệ thống không xoá hẳn dòng tài khoản, chỉ đánh dấu đã xoá. Vì vậy cũng **khôi phục lại được** ngay trong app nếu xoá nhầm (khôi phục xong hãy đặt lại PIN cho họ).
- **Admin đầu tiên** (tài khoản tạo ở màn Thiết lập) là chủ hệ thống: chỉ người này **sửa tên, xoá và khôi phục** tài khoản. Ngược lại, chính tài khoản đó thì **không ai khoá, hạ quyền hay xoá được** — kể cả một admin khác — để cả bãi không bao giờ mất đường quản lý người dùng. Mọi admin đều tạo được tài khoản mới.
- **Admin kèm chức danh.** Quyền Admin và chức danh ở đơn vị là hai thứ riêng: người lập app có thể là Admin nhưng làm CVKTHT. Ở **Người dùng và PIN**, thẻ của mỗi tài khoản Admin có ô **Chức danh ở đơn vị** (Đại đội trưởng / Trung đội trưởng / CVKTHT / không có). Chức danh **không đổi quyền** (vẫn là Admin, duyệt được hết); nó chỉ để app biết người đó giữ chức gì, ví dụ báo cáo ca đưa tên họ vào ô chọn nhanh đúng chức danh (CBPT với CVKTHT). Đổi vai trò khỏi Admin thì chức danh tự bỏ, vì lúc đó vai trò chính là chức danh.
- Số điện thoại của tài khoản đã xoá vẫn bị giữ (mỗi số một tài khoản), nên muốn dùng lại số đó thì **khôi phục** tài khoản cũ thay vì tạo mới.

### Đếm nhiều lần mỗi ngày

Ở **Thêm → Cài đặt → Quy tắc → Mỗi khu phải đếm mấy lần/ngày**. Mặc định **1 lần**, tức như trước: báo một lần là đủ.

- **Giờ làm việc do admin đặt** ngay dưới đó (*Giờ làm từ … đến …*, mặc định 6h–18h). Chọn 2–4 lần thì giờ làm được chia đều thành các khung. Ví dụ giờ làm 6h–18h: 2 lần là *buổi sáng (6h–12h)* và *buổi chiều (12h–18h)*, 3 lần là 6h–10h, 10h–14h, 14h–18h. Chia không chẵn thì mốc có phút: giờ làm 7h–17h chia 3 lần là 7h–10h20, 10h20–13h40, 13h40–17h.
- Màn Cài đặt **xem trước khung giờ** ngay khi chọn, trước khi lưu. Giờ kết thúc phải sau giờ bắt đầu, và mỗi khung ít nhất 1 tiếng (giờ làm 3 tiếng thì không đếm được 4 lần); sai thì báo ngay và không lưu.
- Chia theo giờ làm chứ không chia 24 giờ, vì chia cả ngày thì khung đầu rơi vào nửa đêm và khu nào cũng bị báo thiếu. Đếm trước giờ bắt đầu thì tính vào khung đầu, sau giờ kết thúc thì tính vào khung cuối.
- Đổi giờ làm giữa ngày thì các lần đã đếm hôm đó được **xếp lại theo khung mới**, không mất lần nào.
- **Đây là quy định bắt buộc, không chỉ là lời nhắc.** Khung **đã kết thúc** mà khu chưa đếm thì:
  - Tổng quan hiện thẻ đỏ, thẻ khu đổi nhãn thành *"Thiếu lần đếm"*;
  - màn Duyệt tính là **việc chưa xử lý**;
  - lần sổ tự chốt sau 0h ghi rõ vào nhật ký khu nào thiếu khung nào.
- **Lần đếm khung sau không bù cho khung trước.** Mục đích của việc đếm nhiều lần là có số ở từng buổi; cho bù thì ai cũng đếm một lần buổi chiều cho xong. Quên buổi sáng thì việc thiếu nằm lại trong nhật ký chốt của ngày đó.
- Khung **đang diễn ra** chưa tính là thiếu, nhưng Tổng quan **nhắc người đếm** khu nào chưa đếm khung đó (*"Khu A chưa đếm buổi chiều, còn tới 18h"*), bấm vào là mở thẳng màn đếm khu đó; màn Báo cáo cũng ghi *"khu này đã đếm / chưa đếm"*. Khung **đã hết** mà thiếu thì chỉ người duyệt thấy (chỉ người duyệt có việc để làm). Khu **trống** (không có thép, không có phiếu) không bị đòi. Khu chưa báo lần nào thì đã có nhắc *"chưa báo"*, không bị nhắc thêm lần nữa.
- Đổi số lần đếm hoặc giờ làm **trong ngày** thì màn Duyệt hôm đó báo *"Khung giờ đếm vừa đổi lúc … (ai đổi)"*, vì các lần đếm hôm đó được xếp lại theo khung mới. **Xem lại ngày cũ** ghi rõ lúc tự chốt còn treo việc gì (khu nào thiếu khung nào...).
- **Mỗi lần khu báo lại phải được duyệt lại**: đếm 2 lần/ngày là mỗi khu phải được duyệt 2 lần.
- Khung giờ tính theo **giờ Việt Nam của máy chủ**, không theo đồng hồ điện thoại, nên máy để sai giờ cũng không nhắc sai.
- Báo cáo lưu lúc mất mạng rồi tự gửi lại thì khung tính theo **lúc đếm**, không theo lúc có mạng. Gửi muộn quá 15 phút thì màn Duyệt hiện cả hai giờ (*"đếm lúc 11:30, tới máy chủ lúc 13:00"*) để người duyệt soi.
- Lần người duyệt **chọn số** khi hai người báo khác nhau và mốc **đặt tồn về 0** không được tính là một lần đếm.

### Vay mượn ngoài bãi

Ở **Thêm → Vay mượn ngoài bãi**. Sổ ghi **công nợ thép với đối tác bên ngoài**: ai đang giữ thép của ai, bao nhiêu, phi nào.

- **Thép có qua bãi không?** Khi ghi sổ, người lập được phiếu kho (từ CVKTHT trở lên) chọn:
  - **Có, lập phiếu kho** (chọn khu): app lập kèm một **phiếu kho loại "vay mượn"** cùng lần ghi. Tồn khu đổi khi duyệt (cho mượn thì giảm, đi vay về thì tăng), nhưng thép này **không tính là nhập, cũng không tính là dùng**. Nhờ vậy cho đối tác mượn 300 cây rồi khu đếm hụt 300 cây thì "đã dùng" là **0**, không làm đội mức dùng trung bình, không làm sai dự báo "còn đủ dùng", không bật cảnh báo "dùng nhiều". Sổ và phiếu đi cùng nhau: duyệt hay huỷ bên nào cũng là cả hai. Cho mượn thì không được vượt số khu đang có (phiếu chờ duyệt đã giữ chỗ, như phiếu xuất).
  - **Không, chỉ ghi sổ**: chỉ ghi công nợ, tồn bãi không đổi (ví dụ thép giao thẳng tới công trình, không qua bãi). Tiểu đội trưởng chỉ ghi được kiểu này.
- Báo cáo kỳ có **cột "Vay mượn"** riêng (có dấu: − là cho mượn đi, + là đi vay về), cả trong app lẫn trong CSV. Đẳng thức: **Tồn đầu + Nhập + Điều chỉnh + Vay mượn − Dùng = Tồn cuối**.
- Bốn loại ghi, tính thành **hai cặp riêng**: *Mình vay* / *Mình trả* là **mình nợ đối tác**; *Cho họ vay* / *Họ trả* là **đối tác nợ mình**. Cùng một đối tác có thể vừa cho mình vay D16 vừa đang mượn của mình D18.
- **Ai cũng ghi được** (cả Tiểu đội trưởng), vì người thấy xe thép thường là người ngoài bãi. Một lần ghi được nhiều phi.
- **Bắt buộc xác nhận chứng từ**: trước khi ghi sổ phải tick hai ô *"Đã có biên bản giao nhận"* và *"Đã gửi biên bản lên nhóm Zalo"* (server cũng kiểm, lần xác nhận nằm trong nhật ký). Biên bản là chứng từ gốc, sổ này chỉ là bản ghi nhớ. Ghi xong hai ô tự bỏ tick, lần sau phải tick lại cho biên bản của lần đó.
- **Ngày tháng và chứng từ của mỗi lần ghi**:
  - **Ngày giao nhận** (bắt buộc, mặc định hôm nay) là ngày trên biên bản. Ghi bù được tối đa một năm về trước, không được ghi ngày sau hôm nay. Sổ và lịch sử xếp theo ngày này. Ngày lúc bấm ghi vẫn hiện riêng ở dòng "ghi sổ".
  - **Số biên bản giao nhận** là bắt buộc, để đối chiếu với bản giấy hay ảnh trên Zalo. Có thể ghi thêm **người giao/nhận** và **biển số xe**.
  - **Hạn trả** (không bắt buộc) chỉ có ở lần *đi vay* và *cho mượn*. Có nút nhanh +7, +15 và +30 ngày tính từ ngày giao nhận.
- **Quá hạn tính trên phần còn nợ**: lần trả được trừ vào lần vay **cũ nhất** trước, tính riêng cho từng đối tác, từng phi và từng chiều. Một lần vay đã trả hết thì không còn bị coi là quá hạn. Màn chi tiết đối tác có bảng *còn nợ theo từng lần vay* (ngày, phi, còn bao nhiêu, hạn trả); dòng quá hạn tô đỏ. Thẻ đối tác ghi số khoản quá hạn và hạn trả gần nhất. Tổng quan nhắc từ CVKTHT trở lên khi có khoản quá hạn.
- **Công nợ dễ nhìn**: đầu màn có ô tổng *bãi đang nợ đối tác* và *đối tác đang giữ của bãi* (tấn, số đối tác). Mỗi đối tác là một thẻ tóm tắt hai chiều theo từng phi; **bấm vào** mở màn chi tiết: bảng *Mình vay của họ* (đã vay / đã trả / còn nợ), bảng *Họ mượn của mình*, lần ghi đang chờ duyệt, **toàn bộ lịch sử kể cả lần đã huỷ**, và nút *Ghi sổ với đối tác này*.
- **Duyệt theo cấp bậc** từng lần ghi (CVKTHT duyệt lần ghi của Tiểu đội trưởng; lần ghi của CVKTHT và mọi lần ghi kèm phiếu kho thì cấp 2 duyệt); chưa duyệt thì chưa vào dư nợ. Lần ghi chỉ ghi sổ hiện ngay ở **màn Duyệt** (mục *Sổ vay mượn chờ duyệt*); lần ghi có phiếu kho thì nằm trong *Phiếu chờ duyệt*. Tổng quan nhắc mỗi người đúng số lần ghi mà người đó duyệt được.
- Hoàn tác: người ghi **rút lại** khi chưa duyệt, hoặc **huỷ** trong 10 phút sau khi duyệt; sau đó nhờ người duyệt. Người duyệt huỷ được lần ghi đã duyệt trong **7 ngày**; quá hạn thì ghi một lần **ngược lại** (trả, hoặc vay) để sửa, sổ giữ được cả hai dấu vết. Lần ghi có phiếu kho mà ngày duyệt phiếu đã chốt thì không huỷ được (luật của mọi phiếu kho).
- Ghi *trả* nhiều hơn số đang nợ thì app **nhắc** (có thể một lần vay cũ chưa ai ghi) nhưng không chặn; dư nợ khi đó hiện là **"trả dư"** để không đọc ngược nghĩa.
- **Đối tác**: ai cũng thêm được tên mới; từ CVKTHT trở lên sửa tên hoặc ẩn. Đối tác đã ẩn không ghi thêm được, nhưng dư nợ và lịch sử vẫn giữ.
- Phần **trả dư được giữ lại** và trừ vào lần vay kế tiếp, nên tổng *còn nợ theo từng lần vay* luôn bằng đúng dư nợ trên thẻ đối tác (vay 100, trả 120, vay tiếp 50 thì còn nợ 30, không phải 50).
- **Trùng số biên bản**: ghi một lần cùng đối tác, cùng số biên bản, cùng loại và cùng phi với một lần ghi chưa huỷ thì app **dừng lại hỏi** (nói rõ dòng đang có, ai ghi) — tránh hai người cùng chép một biên bản, hoặc bấm lại sau khi mất mạng. Đồng ý thì vẫn ghi được; ghi bổ sung phi khác của cùng biên bản thì không bị hỏi.
- Thẻ *Sổ vay mượn chờ duyệt* ở **màn Duyệt** hiện đủ chứng từ (ngày giao nhận, số biên bản, hạn trả, xe, người giao/nhận) để đối chiếu với biên bản trước khi duyệt.
- **Ai huỷ, vì sao** nằm ngay trong dòng sổ: từ chối lần ghi của người khác hoặc huỷ lần đã duyệt thì app hỏi lý do; thẻ lần ghi đã huỷ hiện tên người huỷ và lý do (tự rút lại lần ghi của mình thì không hỏi).
- **Tải cả sổ vay mượn (Excel)** ở cuối màn Vay mượn, từ CVKTHT trở lên: mọi lần ghi từ trước tới nay kể cả lần đã huỷ (trạng thái, người ghi / duyệt / huỷ, chứng từ) và bảng dư nợ theo đối tác × phi. Số tấn tính theo kg/cây hiện tại; con số gốc của công nợ là số cây.
- **Ghi bù kèm phiếu kho** thì app nhắc: phiếu kho đổi tồn từ hôm nay, nếu khu đã đếm lại sau lần giao nhận đó thì chọn *chỉ ghi sổ*.
- **Tên đối tác** coi là trùng cả khi chỉ khác hoa/thường ở chữ có dấu ("Đức Anh" / "đức anh") hay thừa khoảng trắng. **Phi còn công nợ** (hoặc còn lần ghi chờ duyệt) thì không ẩn được.
- Database tự chặn dòng sổ hỏng (số lượng ≤ 0, thiếu ngày giao nhận, đối tác không có) và **không cho sửa nội dung dòng đã ghi** — sai thì huỷ rồi ghi lại.
- **Không huỷ được lần vay đã có lần trả ghi vào** (huỷ thì dư nợ thành âm): huỷ lần trả trước, hoặc ghi lại lần vay đúng rồi mới huỷ lần sai. Áp dụng cả khi huỷ từ phía phiếu kho đi kèm.
- Số biên bản so trùng **không kể dấu cách, gạch, chấm, hoa/thường**: "BB 01", "bb-01", "BB.01" là một.
- Hai người cùng duyệt / huỷ một lần ghi: người bấm sau nhận thông báo "vừa được người khác duyệt hoặc huỷ", sổ và nhật ký chỉ ghi một lần.
- **Xoá sạch dữ liệu thép** xoá cả phiếu kho đi kèm sổ vay (vì là số liệu bãi); lần ghi sổ còn lại thành *chỉ ghi sổ*, công nợ không đổi. Lần ghi đang chờ duyệt lúc đó vẫn duyệt được, và không đổi tồn — tồn bãi bắt đầu lại từ lần đếm sau khi xoá.
- Mọi lần ghi, duyệt, huỷ nằm trong **nhật ký**, có chip lọc *Vay mượn* riêng.
- **Xoá sạch dữ liệu thép không xoá sổ vay**: đây là công nợ với bên ngoài, không phải số liệu của bãi. Bản sao toàn bộ có chứa sổ vay; nạp lại một bản sao **cũ chưa có sổ vay** thì sổ vay hiện tại được **giữ nguyên**.

### Sắt vụn xuất ra ngoài

Ở **Thêm → Sắt vụn xuất ra ngoài**, hoặc nút **Sắt vụn xuất ra** ngay đầu màn Vay mượn. Sổ ghi **mỗi lần xe chở sắt vụn ra khỏi bãi**, để thống kê và đối chiếu với phiếu cân của bên mua.

- Sắt vụn là thép thừa, đầu mẩu **trộn nhiều phi**, nên chỉ ghi **khối lượng theo tấn** (gõ `2,5` hoặc `2.5`; sổ lưu theo kg). **Không tính vào tồn bãi**: bảng đếm và phiếu kho tính theo phi, phần thép thành vụn đã ra khỏi tồn từ lúc cắt.
- Mỗi lần ghi: **ngày xuất** (ghi bù được, không sau hôm nay), **khu xuất** (hoặc *Nhiều khu / chung*), **số tấn**, **xuất cho ai** (có nút chọn nhanh các nơi nhận gần đây, để tên không bị gõ lệch), **số phiếu cân / biên bản** (bắt buộc), biển số xe, người nhận, ghi chú.
- **Ai cũng ghi được**, kể cả Tiểu đội trưởng. **Duyệt theo cấp bậc** như sổ vay (CVKTHT duyệt lần ghi của Tiểu đội trưởng; lần ghi của CVKTHT thì cấp chỉ huy duyệt); chưa duyệt thì chưa vào thống kê. Lần chờ duyệt hiện cả ở **màn Duyệt** và được nhắc ở Tổng quan.
- **Thống kê** (chỉ lần đã duyệt): tổng *tháng này*, *năm nay*, *từ trước tới nay*; bảng **theo tháng** (13 tháng gần nhất), **theo khu** và **theo nơi nhận**.
- **Xem theo kỳ**: hai bảng theo khu / theo nơi nhận tính cho *năm nay* (mặc định), *năm trước*, *tất cả*, hoặc **một tháng** — bấm vào dòng tháng ở bảng theo tháng. Chọn một tháng thì danh sách bên dưới là đủ các lần xuất của tháng đó, để đối chiếu với bảng kê của bên mua.
- **Trùng số phiếu cân** (không kể dấu cách, gạch, hoa/thường) thì app dừng lại hỏi, tránh hai người cùng chép một phiếu.
- Hoàn tác: người ghi **rút lại** khi chưa duyệt hoặc huỷ trong 10 phút sau khi duyệt; người duyệt huỷ được trong **7 ngày**; quá 7 ngày thì chỉ cấp chỉ huy huỷ được (sổ này không có "lần ghi ngược lại" như sổ vay, nên phải còn đường gỡ một lần gõ nhầm phát hiện lúc đối chiếu cuối tháng). Từ chối / huỷ lần đã duyệt phải ghi **lý do**; lần đã huỷ vẫn nằm trong sổ, kèm tên người huỷ và lý do. Nội dung một dòng đã ghi thì không sửa — sai thì huỷ rồi ghi lại.
- **Tải sổ sắt vụn (Excel)**, từ CVKTHT trở lên: mọi lần xuất kể cả lần đã huỷ, tổng theo tháng và theo nơi nhận.
- Sổ nằm trong bản sao toàn bộ; **xoá sạch dữ liệu thép không xoá sổ này**.

### Ảnh biên bản

Ảnh chụp biên bản giao nhận / phiếu cân **lưu ngay trong app**, gắn vào đúng dòng sổ, để đối chiếu mà không phải lục nhóm Zalo. Có ở ba chỗ: lần ghi **Vay mượn ngoài bãi**, lần xuất **Sắt vụn**, và **đơn gia công** đã gửi xuất / đã xuất (màn chi tiết đơn).

- **Quy trình: người ghi gửi ảnh ngay lúc ghi, người duyệt chỉ xem lại.** Trong form ghi sổ (vay mượn, sắt vụn) và hộp **XUẤT** của đơn gia công có mục **Ảnh biên bản**: bấm **📷 Chụp / chọn ảnh biên bản** (chụp mới hoặc lấy ảnh có sẵn, cả ảnh đã gửi Zalo; chọn nhiều ảnh một lần), ảnh hiện xem trước, bỏ được từng ảnh. Nút đổi thành **GHI SỔ + GỬI N ẢNH**: bấm là lưu lần ghi rồi gửi luôn ảnh vào đúng lần ghi đó — không có bước tìm xem ảnh nào của dòng nào.
- Ảnh **không bắt buộc**, hai ô xác nhận (biên bản giao nhận, đã gửi nhóm Zalo) vẫn bắt buộc như cũ. Chưa có ảnh thì hộp xác nhận nhắc thẳng *"CHƯA CÓ ẢNH biên bản trong app"* trước khi ghi.
- **Mạng rớt lúc gửi ảnh**: lần ghi vẫn lưu, ảnh chưa lên được giữ lại trên máy và hiện thẻ *"N ảnh biên bản chưa gửi được"* với nút **GỬI LẠI ẢNH** (hoặc *Bỏ*). Đăng xuất thì ảnh đang chọn / chưa gửi bị bỏ, để máy dùng chung không gửi nhầm vào lần ghi của người sau.
- **Quên chụp lúc ghi**: người ghi mở lần ghi đó trong danh sách, bấm **+ Thêm ảnh** (đơn gia công: người làm đơn, ở màn chi tiết đơn). Người khác — kể cả người duyệt — chỉ xem. Dòng đã huỷ vẫn xem được ảnh cũ nhưng không thêm ảnh mới.
- Ảnh hiện thành **ô nhỏ ngay trên dòng sổ**. Ở **màn Duyệt** (sổ vay, sắt vụn chờ duyệt, thẻ *phiếu kho* của lần ghi vay mượn có lập phiếu kho) chỉ để **xem**: không có nút thêm, không có nút xoá; lần ghi không có ảnh ghi rõ *"Chưa có ảnh biên bản"*. Bấm ô ảnh là xem lớn — **chạm ảnh để phóng to đọc chữ** —, chuyển *Trước / Sau*, **Tải xuống** (và **Xoá ảnh** ở ngoài màn Duyệt, theo quyền bên dưới).
- Tối đa **20 ảnh mỗi dòng sổ** (một biên bản vài trang là cùng; chặn lỡ chọn cả thư viện ảnh).
- **Xoá**: người tải lên tự xoá trong **10 phút** (chọn nhầm ảnh); sau đó nhờ CVKTHT trở lên — họ xoá được bất cứ lúc nào. Mọi lần thêm / xoá ghi vào **nhật ký**, nói rõ ảnh của biên bản nào (ngày, số biên bản / phiếu cân, đối tác hoặc cấu kiện); lần **xoá** nằm ở chip *Cần chú ý*, vì đó là xoá chứng từ.
- Mạng chập chờn: app chờ quá hạn thì báo lỗi, nhưng có khi ảnh đã kịp lên máy chủ — gửi lại sẽ ra hai ảnh giống nhau, xoá bớt một trong 10 phút.
- App **tự thu nhỏ ảnh** trước khi gửi (cạnh dài tối đa 1600px, JPEG): đủ đọc chữ, chỉ còn vài trăm KB mỗi ảnh — gửi nhanh ở chỗ sóng yếu. Mỗi ảnh chờ tối đa 60 giây; quá thì báo "mạng quá chậm", ảnh đó không lưu, bấm thêm lại khi sóng khá hơn.
- **Lưu ở đâu**: Cloudflare R2, bucket `kho-thep-anh` (binding `ANH` trong `wrangler.toml`), **không công khai** — chỉ xem được qua app khi đã đăng nhập. Gói miễn phí 10 GB đủ nhiều năm với vài chục ảnh mỗi ngày; vượt thì tính theo dung lượng, rất rẻ, không bị khoá. Bảng `anh_bb` trong database chỉ giữ thông tin ảnh (của dòng nào, ai tải, lúc nào).
- **Bản sao toàn bộ** chứa thông tin ảnh (bảng `anh_bb`) nhưng **không chứa ảnh** — ảnh nằm trên R2, nạp lại bản sao không đụng tới. Hệ quả: nạp lại một bản sao thì ảnh thêm SAU ngày sao lưu không còn hiện (vẫn nằm trên R2), còn ảnh đã xoá SAU ngày sao lưu hiện thành ô trống. Nạp một bản sao cũ chưa có bảng này thì ảnh đang có được giữ nguyên.

### Gia công cấu kiện

Tab **Gia công**, mọi vai trò đều có. Đây là bảng **giao việc gia công** cho các Tiểu đội trưởng: gia công thép của cấu kiện nào, ở vị trí trục nào, cần xong khi nào, đang làm tới đâu. **Không liên quan tới đếm thép**: đơn gia công không đổi tồn, không sinh phiếu kho.

- **Ai cũng xem được mọi đơn của mọi Tiểu đội trưởng.** Đây là chỗ duy nhất trong app không theo nguyên tắc "mỗi người chỉ thấy việc của mình": bảng đơn là bảng chung của cả đơn vị, gom theo từng Tiểu đội trưởng (đang giữ mấy đơn, mấy đơn trễ, mấy đơn vướng). Cuối bảng ghi ai đang không có đơn nào mở.
- **Một đơn gồm**: cấu kiện (chọn loại trong danh mục — Dầm, Cột, Sàn… — hoặc **Khác** rồi ghi tên; số hiệu như D3 thì tuỳ), **vị trí trục (bắt buộc)**, **phân khu** (chọn trong danh mục; bắt buộc khi admin đã lập danh mục phân khu), **tầng hoặc cote** (cao độ, ví dụ `+3.600`; phải ghi ít nhất một — đã ghi tầng thì cote không bắt buộc), hạng mục (chọn trong danh mục, không bắt buộc), giao cho ai, ngày cần xong (kèm buổi sáng / chiều nếu cần), nội dung và khối lượng (chữ tự do). Mỗi đơn giao cho **một** Tiểu đội trưởng.
- **Danh mục do admin lập trước** (tab Gia công → nút **⚙** → *Thiết lập gia công*, chỉ Admin): **phân khu**, **hạng mục**, **loại cấu kiện**. Lập một lần, sau đó người giao chỉ việc bấm chọn — và cả đơn vị gọi một khu bằng đúng một tên, nên gom theo khu và tìm kiếm mới đúng. Sáu loại cấu kiện thường gặp có sẵn; *Khác* luôn có. Xoá một mục không đổi gì ở đơn đã giao (đơn giữ tên cũ), muốn đổi tên thì xoá rồi thêm lại. Khi chưa có danh mục phân khu thì app chưa đòi phân khu.
- **Nhập trục nhanh**: ba phần **X từ – đến**, **Y từ – đến**, **Trục từ – đến**, ghi phần nào cũng được và kết hợp tuỳ ý (cần ít nhất một). Phần *Trục*: ghi **một trục** là cấu kiện **nằm trên** trục đó (`Trục 6`), ghi **hai trục** là nằm **trong khoảng giữa** hai trục (`Trục 1-2`); ô Trục nhận cả chữ (trục A, C). Ví dụ: `X12-X17 / Y3-Y5`, `Trục 6`, `X12 / Trục 1-2`. Ô X, Y dùng bàn phím số. Cách ghi khác (lõi thang T2…) thì bấm **Gõ tự do**. Trục vừa dùng ở cùng phân khu hiện thành nút bấm lại.
- **Tầng chỉ cần gõ `1`, `2`, `B1`, `mái`**: lỡ gõ "Tầng 5" thì app vẫn lưu `5`, màn hình tự hiện "Tầng 5".
- **Gợi ý bỏ được**: mỗi gợi ý trục / tầng có nút **×**. Bỏ chỉ trên máy mình, không đụng đơn nào; gợi ý tự quay lại nếu sau đó có đơn mới dùng đúng giá trị đó.
- **Ai làm được gì**:

  | Việc | Ai làm |
  |---|---|
  | Giao đơn, sửa đơn, dời hạn, giao lại cho người khác, huỷ đơn | CVKTHT trở lên |
  | **Nhận đơn, cập nhật tiến độ, báo vướng, xác nhận đã xong** | **Chỉ Tiểu đội trưởng được giao đơn đó** — cấp trên cũng không làm thay |
  | Mở lại đơn đã xong | CVKTHT trở lên, bắt buộc ghi lý do |
  | Xem mọi đơn và lịch sử từng đơn | Tất cả |

- **Giao đơn nhanh**: nút **+ Giao đơn** nằm ngay đầu bảng. Màn soạn điền sẵn hạn = ngày mai; loại cấu kiện, phân khu, tầng, hạng mục và người nhận = của lần giao trước; hạn có nút Hôm nay / Mai / +2 / +3 / +7. Giao cả loạt thì bấm **GIAO + ĐƠN TIẾP**: app giữ lại tất cả trừ số hiệu, trục và nội dung, nên đơn sau chỉ còn gõ mấy con số của trục. Ở màn một đơn có **Giao đơn mới giống đơn này**.
- **Đơn trùng thì app hỏi lại**: người nhận đang giữ một đơn còn mở giống hệt (cùng cấu kiện, phân khu, tầng, cote, trục) thì app dừng lại hỏi trước khi giao thêm — tránh bấm lại khi mạng chập chờn, hoặc chép đơn mà quên sửa trục.
- **Theo dõi nhanh**: đầu bảng (đứng yên khi cuộn) có ô tìm — gõ không dấu cũng ra: `dam d3`, `x12`, `khu a tang 5`, tên người — và các mục lọc kèm số đơn: *Đang mở, Của tôi, Trễ, Vướng, Đứng yên, Có tin mới, Chưa nhận, Chưa xuất, Đã xuất / huỷ*. Dưới đó là **ba cách gom cùng một bộ đơn**: **Theo tổ** (ai đang giữ gì, ai đang rảnh), **Theo hạn** (Trễ hạn → Hôm nay → Ngày mai → Trong 7 ngày tới → Sau 7 ngày), **Theo khu** (từng phân khu đang làm tới đâu). Mỗi nhóm ghi số đơn, số trễ, số vướng. Mỗi đơn ba dòng: cấu kiện · trạng thái; **trục** · phân khu · tầng (kèm tên người giữ khi không gom theo tổ); thanh tiến độ · hạn.
- **Tìm theo mã**: gõ `W23` ra mọi đơn của vách W23 (kể cả đã xong, đã huỷ), không ra W2 hay W230; mã có số phải khớp đúng mã, chữ thường thì khớp đầu từ (`va` ra Vách). Gõ nhiều từ thì đơn phải khớp tất cả (`w23 tang 5`). Mã trục khớp theo dải: `x14` ra cả đơn ghi `X12-X17`. Đầu kết quả ghi số đơn khớp.
- **Làm nhanh trên bảng**: đơn của chính mình có sẵn **NHẬN ĐƠN**, rồi một hàng ba nút **Lên N%** (nấc kế tiếp), **Vướng** / **Hết vướng**, **XONG** ngay trên thẻ — không phải mở từng đơn (riêng XONG hỏi lại một lần). Chọn thẳng một mức khác hay ghi chú kèm tiến độ thì mở đơn.
- **Báo vướng một chạm**: bấm *Vướng* là hiện hộp chọn **lý do** (danh mục admin lập: Thiếu thép, Chưa có bản vẽ, Bản vẽ sai, Máy hỏng, Thiếu người, Chờ mặt bằng… và *Khác* — phải ghi rõ) và **mức độ**: *Vẫn làm phần khác* hay *Dừng hẳn*. Ghi thêm thì tuỳ. Đơn dừng hẳn viền đỏ và xếp lên đầu.
- **Người giao nhận xử lý**: thẻ đơn vướng ghi *"chưa ai nhận xử lý"* cho tới khi CVKTHT trở lên bấm **ĐÃ XEM, ĐANG XỬ LÝ VƯỚNG** (ngay trên thẻ hoặc trong đơn); sau đó tổ thấy *"Cv đang xử lý"*. Tổng quan của người giao ghi rõ *N đơn đang vướng (M dừng hẳn, K chưa ai xử lý)*. Báo vướng lại thì lần báo mới lại "chưa ai nhận".
- **Đơn đứng yên**: đơn đã nhận mà **2 ngày** không ai cập nhật (không tiến độ, không báo vướng) thì thẻ ghi *Đứng yên N ngày*, viền vàng, có mục lọc **Đứng yên**, và cả người làm lẫn người giao đều được nhắc ở Tổng quan. Màn một đơn ghi *Người làm cập nhật … trước*.
- Khi gom theo hạn hoặc theo khu, thẻ đơn ghi **tên gọi ngắn** của người giữ đơn ("An" thay cho "Nguyễn Văn An").
- **Nhiều Tiểu đội trưởng cùng làm một đơn** (tối đa 4, ví dụ tổ ca ngày và tổ ca đêm): ở mục *Giao cho* bấm chọn nhiều người, người chọn đầu tiên là người chính. Mọi người trong đơn **ngang quyền**: ai cũng nhận đơn (một người nhận là đơn đã nhận), cập nhật **một % chung** (lịch sử ghi rõ ai bấm), báo / hết vướng và **xác nhận xong** — xong rồi thì đơn khoá với tất cả. Khi đơn bị huỷ, **mỗi người phải tự bấm "Đã biết"**. Bảng gom theo tổ hiện đơn trong nhóm của từng người, kèm dòng *Cùng làm: An, Bình*. Sửa đơn mà chỉ thêm / bớt người cùng làm thì đơn giữ nguyên trạng thái; giao hẳn cho người khác thì về *Mới giao*. Mỗi tổ làm một phần riêng (tổ làm thép chủ, tổ làm đai) thì nên giao thành hai đơn. Báo cáo ca vẫn tính mỗi đơn theo người chính.
- **Trao đổi trên đơn**: mỗi đơn có mục *Trao đổi và lịch sử* — một dòng thời gian gộp tin nhắn với các mốc của đơn (nhận, tiến độ, vướng, xong…), cũ ở trên, mới ở dưới, ô nhắn ở đáy màn.
  - **Viết**: người trong đơn và mọi CVKTHT trở lên. **Đọc**: cả đơn vị. Tối đa 500 ký tự một tin.
  - **Trả lời nhanh** một chạm: người làm có *Đã rõ, Đang làm, Cần thêm thời gian, Cần thêm thép*; người giao có *Đã rõ, Làm gấp, Đã chuyển thép, Kiểm tra lại bản vẽ*.
  - **Cần trả lời**: người giao bật khi gửi câu hỏi; thẻ đơn ghi *Chờ An trả lời*, Tổng quan của người làm có thẻ đỏ *Chờ bạn trả lời: …* cho tới khi một người trong nhóm nhắn lại.
  - **Tin mới**: thẻ đơn có huy hiệu *N tin mới*, bảng có mục lọc *Có tin mới*, Tổng quan có thẻ *N tin mới về đơn gia công* (chỉ đơn mình làm, mình giao, hoặc mình đã nhắn trong đó). Mở đơn là đã đọc; tin chưa đọc viền đỏ.
  - **Không sửa, không xoá**; gửi nhầm thì **thu hồi trong 2 phút** (còn dòng *Tin đã thu hồi*). Đơn đã xong / huỷ vẫn nhắn được **7 ngày** rồi khoá.
  - Tin tới máy khác sau tối đa khoảng 1 phút (đang mở đơn thì khoảng 15 giây). Tin nhắn **không** bắt mọi máy tải lại cả dữ liệu chung, chỉ hỏi lại danh sách tin chưa đọc. Chưa gửi được ảnh.
- **Xuất sau khi xong** (mỗi đơn một lần): đơn xong thì thành *Xong · chưa xuất*. Người trong đơn bấm **XUẤT**, tick đủ ba việc — **đã ký biên bản giao nhận**, **đã kiểm đếm**, **đã chụp ảnh gửi nhóm Zalo** — và ghi **xuất cho ai / vị trí lắp dựng**; đơn thành *Chờ duyệt xuất*. CVKTHT trở lên (không phải người trong đơn) mở đơn xem đủ xác nhận rồi bấm **DUYỆT XUẤT** hoặc **Không duyệt** (bắt buộc lý do, đơn về *chưa xuất* để tổ gửi lại). **Đã xuất thì đơn khoá hẳn**, không mở lại được. Xuất không đụng tồn kho thép (thép đã tính là dùng khi lấy ra gia công). Chưa chụp ảnh trong app được, chỉ xác nhận đã gửi Zalo.
  - **Nhắc**: tổ thấy *N đơn đã xong, chưa xuất* ở Tổng quan (đỏ khi quá 1 ngày); người giao thấy *N đơn chờ bạn duyệt xuất* và *N đơn xong quá 1 ngày chưa xuất*; tab **Duyệt** có mục *Gia công chờ duyệt xuất*. Bảng có mục lọc **Chưa xuất**; đơn xong chưa xuất không rời bảng cho tới khi xuất.
- **Xem nhiều đơn**: nút **☰ Gọn** đổi bảng sang **danh sách gọn** — mỗi đơn một dòng (chấm màu · cấu kiện · trục, rồi trạng thái · % · hạn · việc gấp nhất), khoảng 9–12 đơn một màn; bấm lại để về dạng thẻ. Bấm **tên nhóm** để thu gọn / mở nhóm đó. Đầu bảng còn 2 hàng: ô tìm, rồi nút đổi cách gom (*Theo tổ ⇄*), *Gọn* và các mục lọc. App nhớ các lựa chọn này trên từng máy. Thẻ đơn chỉ hiện **một dòng cảnh báo gấp nhất** kèm *+N việc khác*; nhãn *Đang làm* màu xanh, *Đã nhận* màu xám.
- **Vòng đời**: *Mới giao* → *Đã nhận* → *Đang làm* (theo nấc 10%, từ 10 tới 90%) → *Đã xong*. Nấc 10% để báo cáo ca gửi cấp trên lấy thẳng được con số ("đang gia công 80%"); đơn giao trước bản 28 đang ở 25% / 75% giữ nguyên số cho tới lần cập nhật sau. **Không có bước cấp trên duyệt**: người được giao bấm *Xác nhận đã xong* là đơn xong. Vì không ai kiểm lại, CVKTHT trở lên có nút **Mở lại đơn** khi đơn báo xong mà thực tế chưa xong; đơn về *Đang làm* 90% và lý do nằm trong lịch sử đơn.
- **Đang vướng** là cờ đi kèm, không phải một trạng thái: Tiểu đội trưởng ghi đang kẹt gì (thiếu thép, chưa có bản vẽ…), đơn vẫn giữ tiến độ. Hết kẹt thì bấm *Đã hết vướng*.
- **Trễ hạn** do app tự tính: qua ngày cần xong mà đơn còn mở; đơn hạn **buổi sáng** thì trễ từ 12h trưa hôm đó. Đơn trễ viền đỏ, đơn vướng viền vàng, cả hai xếp lên đầu. Ngày cần xong không được trước hôm nay và không xa quá một năm.
- **Đơn bị mở lại** mang lý do ngay trên thẻ (viền đỏ, xếp lên đầu) cho tới khi xong lần nữa.
- **Huỷ đơn nghĩa là "không cần làm nữa" — không ai xoá được đơn**, kể cả cấp chỉ huy: xoá là mất dấu ai giao, ai làm tới đâu. CVKTHT trở lên huỷ đơn còn mở, bắt buộc ghi lý do (chỉ bớt khối lượng thì dùng *Sửa đơn*). Sau khi huỷ:
  - đơn bị khoá: không ai nhận, cập nhật hay sửa được; thẻ đơn ghi **Không làm nữa**, lý do, ai huỷ, lúc nào, và **dừng ở mấy %**;
  - **người giữ đơn phải bấm "ĐÃ BIẾT, DỪNG LÀM"**. Chưa bấm thì đơn nằm đầu danh sách của họ, Tổng quan của họ có thẻ đỏ gọi đúng tên đơn (*KHÔNG LÀM NỮA: Dầm D3 · X12-X17*), và người giao thấy *"… chưa xem"* cùng thẻ nhắc *đơn đã huỷ mà người giữ đơn chưa xem*. App chưa có thông báo đẩy, nên đây là cách để người huỷ chắc chắn bên kia đã dừng tay;
  - **huỷ nhầm thì khôi phục được trong 7 ngày** (CVKTHT trở lên, ghi lý do): đơn về đúng trạng thái trước khi huỷ, giữ nguyên tiến độ và lịch sử. Quá 7 ngày thì giao đơn mới giống đơn đó;
  - **tìm kiếm tìm trên mọi đơn**, kể cả đã huỷ và đã xong, dù đang ở mục lọc nào — để không ai tưởng đơn chưa được giao rồi giao lại.
- **Lịch sử đơn** ghi mọi lần nhận, cập nhật tiến độ, báo vướng, sửa, huỷ, mở lại (ai, lúc nào). Dời hạn thì ghi rõ hạn cũ → hạn mới. Giao lại cho người khác thì đơn về *Mới giao*: người mới phải tự nhận.
- **Tổng quan nhắc đúng người, mỗi người một thẻ**: người giữ đơn thấy *Đơn gia công của bạn* kèm đếm từng loại (bị mở lại, trễ hạn, vừa bị huỷ, chưa nhận, hạn hôm nay); CVKTHT trở lên thấy *N đơn trễ hạn · N đơn đang vướng* của cả đơn vị. Như mọi lời nhắc khác, chỉ hiện khi người đó **mở app** — chưa có thông báo đẩy.
- Đơn đã xong hoặc đã huỷ nằm lại bảng chung **30 ngày** (mục *Xong / huỷ*), sau đó rời bảng nhưng không bị xoá. Các mốc giao, sửa, xong, huỷ, mở lại nằm trong **nhật ký**, có chip lọc *Gia công*.
- Người được giao bị đổi vai trò hoặc xoá tài khoản thì **đơn không mất**, vẫn đứng tên người đó; bảng ghi rõ các đơn còn mở của người này **cần giao lại**, và CVKTHT trở lên giao lại cho Tiểu đội trưởng khác.
- Ảnh biên bản xuất: chọn ngay trong hộp **XUẤT**, gửi kèm lần xuất; quên thì người làm đơn thêm ở màn chi tiết đơn (xem **Ảnh biên bản**). Chưa có: ảnh trong trao đổi trên đơn, cập nhật tiến độ khi mất mạng, danh sách thép theo phi. **Xoá sạch dữ liệu thép không xoá đơn gia công**; bản sao toàn bộ có chứa đơn, nạp lại bản sao cũ chưa có đơn thì đơn hiện tại được giữ nguyên.

### Quân số đầu ca

Có **hai luồng**: Tiểu đội trưởng **tự khai báo và báo** quân số của tổ mình (thẻ *Quân số tổ* ở Tổng quan — chỗ báo duy nhất); CVKTHT trở lên **tự đặt số thiết lập** để báo cáo ca dùng khi tổ chưa báo. Mỗi tổ báo quân số ở **đầu mỗi ca**; đây là nguồn số cho mục quân số của báo cáo ca gửi cấp trên. **Không liên quan tới đếm thép.**

- **Một tổ = một Tiểu đội trưởng.** Có bao nhiêu tài khoản Tiểu đội trưởng đang dùng thì có bấy nhiêu tổ.
- **Hai ca**: ca ngày 6h30 → 18h30, ca đêm 18h30 → 6h30 sáng hôm sau. **Ca đêm thuộc ngày bắt đầu ca**: báo lúc 2h sáng ngày 13 vẫn là ca đêm ngày 12. Ca tính theo giờ Việt Nam của máy chủ.
- **Báo theo ca**: tổ làm cả hai ca thì báo hai lần, tổ chỉ làm ca đêm thì chỉ báo ca đêm. Báo được cho ca đang diễn ra, và báo sớm cho ca kế tiếp. Báo lại là ghi đè số của ca đó.
- **Tiểu đội trưởng báo ngay trên Tổng quan**, không phải vào màn nào. Thẻ *Quân số tổ* đứng **trên cùng** (trên cả khối tồn kho) và làm hai việc tách hẳn nhau: **đặt lịch ca** của tổ (một lần, 15–30 ngày mới đổi) và **báo quân số** của ca đó. Thẻ chỉ có **một nút báo**, là nút của ca tổ đang làm. Dòng tiêu đề ghi luôn hạn báo và ca của tổ; dòng dưới ghi *Tổ 21 người (đổi) · nghỉ: không ai*.
  - **Khai báo tổ**: gõ **tổng quân số của tổ**, rồi chọn *Ca ngày / Ca đêm / Cả 2 ca*, kèm thời hạn *Đến khi đổi / 15 ngày / 30 ngày*. Chạm ca là lưu cả hai; chưa gõ tổng thì chưa lưu. Tổng đã khai vào thẳng thẻ báo, không phải gõ lại mỗi ca. Chưa đặt hoặc hết hạn thì thẻ hỏi ca trước rồi mới cho báo. Nút **Đổi ca** luôn có trên thẻ. CVKTHT trở lên đặt hộ được.
  - **Ngày đủ quân: 1 chạm.** Có người nghỉ: bấm *Có người nghỉ*, chạm lý do để thêm một người, hoặc **gõ thẳng số** vào ô cạnh lý do (5 người ốm không phải chạm 5 lần, gõ 0 là bỏ). Ô **ghi chú** luôn có sẵn ở đó (bắt buộc khi có *lý do khác*).
  - **Như hôm qua**: lấy lại danh sách nghỉ của lần báo trước (nghỉ phép, về quê thường kéo dài vài ngày). Đây là nút phải tự bấm, không tự điền sẵn, để người đã đi làm lại không bị báo nghỉ mà không ai để ý.
  - **Tổ ca đêm** buổi sáng không bị nhắc gì; thẻ ghi *Ca đêm …: mở báo từ 17:30* (một tiếng trước giờ vào ca), kèm nút *Báo sớm*.
  - **Tổ làm cả 2 ca** báo từng ca một (ca tới trước báo trước). Mỗi ca ghi *Người của tổ làm ca ngày / ca đêm* (điền sẵn theo lần trước), số đi làm = số đó − nghỉ.
  - **Mất sóng lúc bấm báo**: app lưu quân số trên máy (theo từng người, máy dùng chung vẫn đúng tên), thẻ ghi *chờ gửi (mất sóng)* và **tự gửi khi có mạng**.
  - Báo xong thẻ thành *Ca ngày …: đã báo lúc …* kèm nút **Sửa** (sửa tại chỗ). Thẻ vàng khi chưa báo trong hạn, đỏ khi quá hạn.
  - Tiểu đội trưởng **chỉ có một chỗ** cho quân số: thẻ *Quân số tổ* trên Tổng quan (báo, sửa, xem đã báo). Báo xong, thẻ có lối *Xem thống kê nghỉ của tổ ›*. Không còn màn "Quân số tổ đã báo" (lặp đúng thẻ này).
- **Hạn báo**: ca ngày trước **7h00**, ca đêm trước **19h15**. Còn trong hạn thì thẻ nhắc màu vàng, quá hạn chuyển **đỏ** (*Quá hạn báo quân số…*). Hạn chỉ để nhắc, báo muộn vẫn ghi được. **CVKTHT trở lên đổi hạn** ở dòng *Hạn báo* cuối bảng quân số (thu gọn, bấm **Đổi** mới hiện ô giờ); hạn ca ngày phải nằm trong ca ngày, hạn ca đêm từ giờ vào ca đêm tới trước nửa đêm.
- **Tổ đang làm ca nào thì chỉ bị nhắc ca đó**, theo **lịch ca** tổ đã đặt. Tổ ca đêm không bị nhắc báo ca ngày, và trên bảng ca ngày mang nhãn *Làm ca đêm* chứ không phải *Chưa báo*. Tổ chưa đặt lịch thì app tạm đoán theo lần báo gần nhất.
- **Một lần báo gồm**: tổng quân số của tổ (điền sẵn theo lần báo trước), số nghỉ **theo từng lý do** (ốm, nghỉ phép năm, về quê, việc gia đình, OFF luân phiên, lý do khác — bấm + / −), số đi làm ca này, ghi chú. **OFF luân phiên nằm trong số nghỉ.** Có *lý do khác* thì bắt buộc ghi rõ ở ô ghi chú.
- **Số luôn khớp nhau**: số nghỉ là tổng các lý do; số đi làm app tự tính bằng tổng trừ số nghỉ. **Tổ chia hai ca** thì gõ lại số đi làm ca này, phần còn lại app tính là người của ca kia; tới đầu ca kia, ô ghi điền sẵn đúng số người đó. Đi làm cộng nghỉ nhiều hơn tổng thì app không nhận.
- **Ai làm được gì**:

  | Việc | Ai làm |
  |---|---|
  | Báo quân số tổ mình, cho ca đang diễn ra hoặc ca kế tiếp | Tiểu đội trưởng của tổ đó |
  | Đặt lịch ca của tổ mình | Tiểu đội trưởng của tổ đó (CVKTHT trở lên đặt hộ được) |
  | Xem mọi tổ; đặt **số thiết lập**; xếp thứ tự tổ; đổi hạn báo | CVKTHT trở lên |
  | Xem quân số tổ khác | Chỉ CVKTHT trở lên — Tiểu đội trưởng chỉ thấy tổ mình |

- **CVKTHT trở lên làm trên một màn, đọc từ trên xuống** (Thêm → *Báo cáo ca và quân số các tổ*), mỗi thứ chỉ ở một chỗ. Hai loại số tách rõ:
  - **Tổ báo**: thanh trên cùng chỉ đếm (*Quá hạn: 1 tổ · Tổ đã báo 2/3*, chạm là tới mục 3). **Từng tổ chỉ nằm ở mục 3**, cùng nút **chép tin nhắc** tổ chưa báo và nút **bánh răng** (thiết lập) trên tiêu đề mục 3: mỗi dòng của mục 3 kèm nhãn *Đã báo* / *Chưa báo · số thiết lập* / *Chưa báo* (*Quá hạn*); tổ làm ca kia là dòng cuối không nhãn. **Chỉ để xem và nhắc**: CVKTHT không ghi vào báo cáo của tổ.
  - **Thiết lập** (nút bánh răng ở bước 1) — bảng gọn, mỗi tổ một dòng: *Ca* (Ngày / Đêm / 2 ca), *Tổng*, *Làm ngày*, *Làm đêm* — là **số đi làm**; người nghỉ ghi riêng theo lý do ở dòng *Nghỉ* dưới mỗi tổ, **đi làm + nghỉ không vượt tổng** (tổ một ca bỏ trống ô đi làm = tổng − nghỉ; đổi ca thì cả tổ sang ca mới); ô của ca tổ không làm thì khoá; dòng cuối **Tổng N tổ** cộng quân số mọi tổ. **Một nút LƯU TẤT CẢ** ở đáy lưu mọi thay đổi trên bảng. Số **xám** là gợi ý theo số của chính tổ (số tổ tự khai hoặc lần tổ báo gần nhất, **số nào mới hơn thì lấy**), **chưa lưu** — báo cáo ca chưa dùng cho tới khi bấm Lưu tất cả. Số thiết lập là số dự phòng: báo cáo ca dùng nó cho tổ **chưa báo**.
  - **Người nghỉ theo lý do** (dòng *Nghỉ: … sửa* dưới mỗi tổ): CVKTHT ghi số người nghỉ của từng ca theo lý do, như tổ tự báo (chạm lý do để thêm 1 người; *lý do khác* phải ghi rõ). Số nghỉ nằm **trong** số người của ca: đi làm = số người ca − nghỉ. Báo cáo ca của tổ chưa báo viết đủ *"ca ngày 16/20 cn, nghỉ 4 cn — 2 ốm, 2 về quê"*. Số này giữ nguyên qua các ca cho tới khi sửa.
  - **Nhiều người cùng thiết lập**: hai người sửa hai tổ khác nhau không ảnh hưởng nhau. Hai người sửa **cùng một tổ** thì người lưu sau bị từ chối, app nói rõ *"… vừa sửa số thiết lập tổ …: tổng …, ca ngày …, ca đêm …"* và tải lại số mới để xem rồi quyết.
- **Chép tin nhắc**: nút *Chép tin nhắc N tổ chưa báo* (ở bước 1) ra sẵn danh sách tổ chưa báo kèm hạn, dán vào nhóm Zalo.
- **Xếp thứ tự tổ** (thẻ Thiết lập): bấm Lên / Xuống từng tổ rồi Lưu. Thứ tự này dùng cho bảng quân số và mục 3 của báo cáo ca.
- **Nhắc soạn báo cáo ca**: qua hạn báo mà ca đó chưa chép báo cáo thì Tổng quan của CVKTHT có thẻ *Soạn báo cáo ca … gửi cấp trên* (ghi số tổ đã báo), bấm là mở thẳng màn soạn.
- **Tổng quan nhắc đúng người**: thẻ báo của Tiểu đội trưởng ghi *Chưa báo quân số ca ngày …* kèm giờ hạn khi tổ chưa báo ca đang làm, và nhắc cả ca kế tiếp từ một tiếng trước giờ vào ca; CVKTHT thấy *N/M tổ chưa báo quân số* (chỉ đếm các tổ làm ca đó), kèm tên và hạn báo, bấm vào là mở màn báo cáo ca, bước 1, để nhắc. Cấp chỉ huy không bị nhắc. Chỉ hiện khi người đó **mở app** — chưa có thông báo đẩy.
- Ca đã qua thì Tiểu đội trưởng không sửa được nữa. App **không còn màn ghi thay** cho CVKTHT: tổ không báo thì báo cáo ca dùng số thiết lập, hoặc người soạn sửa tay mục 3. Mọi lần báo nằm trong **nhật ký**, có chip lọc *Quân số*.

### Sao lưu tự động hằng tuần
Mỗi tuần app tự lưu một bản sao toàn bộ lên kho R2 (`ANH`, thư mục `saoluu/`) lúc 2 giờ sáng giờ Việt Nam, giữ 8 bản gần nhất (bản cũ hơn tự xoá). Admin đầu tiên vào **Cài đặt → Sao lưu toàn bộ** để xem danh sách, **Tải về**, hoặc **Sao lưu ngay lên kho**. Tệp tải về y hệt "Tải bản sao toàn bộ", nạp lại bằng ô *Nạp lại từ bản sao*. Mã nguồn: `src/saoluu.js`; đọc mọi bảng trong một lượt gọi D1 để vừa hạn mức của lịch chạy mỗi giờ.

### Sổ thép về công trình (Thêm → *Thép về công trình*)
Sổ **thống kê** mọi chuyến thép về công trình từ đầu năm — theo dõi đơn hàng, nhà cung cấp, ngày về, loại, số lượng. **Không đụng tồn bãi** (số ra / vào bãi trước đây không có nên tổng thép về không cần khớp tồn bãi; thép về từ nay mà vào bãi thì vẫn lập phiếu Nhập kho như thường). Mã nguồn: `src/thepve.js`, bảng `thep_ncc`, `thep_don`, `thep_don_dong`, `thep_ve`, `thep_ve_dong` (cấu trúc bản 45).
- **Quyền:** ghi / lập đơn / nhập Excel / huỷ — admin đầu tiên và người được **admin đầu tiên giao quyền** (màn Người dùng → *Giao quyền*, cột `users.thep_ve`); xem — thêm CVKTHT trở lên.
- **Mỗi dòng một phi:** số bó, số cây, **kg theo phiếu** (gõ tay, nhận cả "12.500") và **kg app tự tính** = (bó × cây/bó + cây) × kg/cây (chụp lại lúc ghi), kèm chênh lệch. Thống kê dùng kg theo phiếu, thiếu thì kg tự tính.
- **Đơn hàng:** nhà cung cấp, số đơn, ngày đặt, hạn, các phi + khối lượng đặt; chuyến về gắn vào đơn, thẻ đơn hiện đặt / đã về / còn thiếu theo phi, trễ hạn tô đỏ. Đóng đơn, huỷ (chỉ khi chưa có chuyến), mở lại.
- **Nhập Excel (số liệu cũ):** chọn cả bảng trong Excel (kể cả dòng tiêu đề) → chép → dán. Cột bắt buộc *Ngày*, *Nhà cung cấp*, *Phi* và ít nhất một trong *Số bó* / *Số cây* / *Kg* / *Tấn*; cột thêm *Số đơn*, *Số phiếu*, *Biển số*, *Ghi chú*. Dòng cùng ngày + nhà cung cấp + số phiếu gộp một chuyến; số đơn trùng đơn đã lập thì gắn vào đơn. Bấm *Kiểm tra* trước (báo lỗi từng dòng, không ghi), sạch rồi mới *Nhập*; cả lần nhập là một giao dịch.
- **Thống kê:** tổng kỳ, theo tháng, theo nhà cung cấp, theo phi; xuất CSV mở bằng Excel. Chống ghi trùng (bấm đúp; số phiếu trùng thì hỏi lại).

### Báo cáo sản lượng (Thêm → *Báo cáo sản lượng*, CVKTHT trở lên)
Cùng khuôn với báo cáo ca nhưng là **một báo cáo gộp ca ngày và ca đêm** cho cả ngày, mặc định hôm nay. Mã nguồn: `src/sanluong.js`, bảng `san_luong` (cấu trúc bản 44); thiết lập nằm trong mẫu `bc_mau` (khoá `sl`).
- **Phần đầu** dùng chung mẫu với báo cáo ca (đơn vị, chỉ huy, dự án, khu vực); sửa ở màn Báo cáo ca.
- **Mục 2 Quân số**: mỗi tổ một dòng. Quân số của tổ = số đã báo của **ca ngày của ngày báo cáo** và/hoặc **ca đêm hôm trước** (tổ làm đêm; tổ chia hai ca thì cộng cả hai). Không có phần nghỉ và lý do nghỉ. Tổ không báo thì lấy số thiết lập đã chép lúc hết ca. Thêm **số công gia công thép** của từng tổ: mặc định bằng số đi làm, sửa được (chỉ ô đã sửa mới được lưu).
- **Thiết lập** (nút bánh răng, CVKTHT trở lên): **công chuẩn** kg/công (mặc định 158), **tỷ lệ giá** (0,2 – 1, mặc định 0,2) **chung cho mọi tổ**, **tỷ lệ gia công riêng từng tổ** (0,5 – 1; tổ chưa đặt thì tạm ngẫu nhiên 0,70 – 0,80, cố định theo tổ).
- **Sản lượng**: mỗi tổ `kg = (công × công chuẩn × tỷ lệ gia công của tổ) ÷ tỷ lệ giá`, làm tròn kg; tổng = cộng các tổ (chỉ hiện trên màn hình). Tự tính theo thiết lập. Lưu báo cáo của một ngày thì **chụp lại thiết lập đang dùng**: đổi thiết lập sau này không làm đổi báo cáo cũ (có nút *Tính lại* khi muốn áp thiết lập hiện tại).
- **Bản chữ để dán Zalo** đúng mẫu đơn vị: tiêu đề, phần đầu, rồi mỗi tổ một dòng, ví dụ `• Tổ A: ca ngày 12/21 cn gia công thép 8532 kg`; tổ chỉ làm đêm `• Tổ B (làm ca đêm) 16/20 cn gia công thép 10112 kg`; tổ làm hai ca `• Tổ C: ca ngày 7/19 cn, ca đêm 7/19 cn gia công thép 8395 kg` (không ghi số nghỉ). Tổ làm ca ngày xếp trước, tổ chỉ làm đêm sau.
- **Quân số lấy từ chính Báo cáo ca, tính bằng cùng một hàm** (`bcQuanSo` trong `app.js`) — server không tính riêng, nên hai báo cáo không bao giờ ra hai con số khác nhau. Báo cáo sản lượng lấy báo cáo ca của **ca ngày hôm nay** và **ca đêm hôm trước** rồi cộng theo tổ. Có hai nút nguồn giống báo cáo ca: *Theo tổ báo* (tổ chưa báo thì lấy *Thiết lập quân số*) và *Chỉ số thiết lập* (chỉ lấy số thiết lập). Mặc định theo nguồn đã chọn trong báo cáo ca của từng ca; đổi ngay trên màn sản lượng thì áp cho cả hai ca và được lưu cùng báo cáo.
- Nút *Chép báo cáo* chép bản chữ đúng khuôn vào bộ nhớ tạm và lưu; hai người lưu chồng nhau thì người sau được báo tải lại.

- Chưa có: màn chỉnh giờ ca (giờ ca đang là 6h30 / 18h30, lưu ở cài đặt `ca1_tu` / `ca2_tu` tính bằng phút), gửi lại tự động khi mất mạng, nay đã có ở mục [Báo cáo ca gửi cấp trên](#báo-cáo-ca-gửi-cấp-trên).
- **Xoá sạch dữ liệu thép không xoá quân số**; bản sao toàn bộ có chứa quân số, nạp lại bản sao cũ chưa có bảng này thì quân số hiện tại được giữ nguyên.

### Thống kê quân số

Ở **Thêm → Thống kê quân số**, màn riêng, không dính tới báo cáo ca. CVKTHT trở lên xem mọi tổ; Tiểu đội trưởng xem tổ mình.

- **Mỗi câu hỏi một chỗ trả lời**: *ca đang diễn ra* là việc của **Báo cáo ca**; **Thống kê** là chuyện các ngày đã qua và các tháng. Mặc định **xem theo tháng**; xem theo ngày thì mặc định **hôm qua**; xem hôm nay thì đầu màn có lối *Báo cáo ca ›*.
- **Bốn khối, không lặp số của nhau**: (1) **thẻ đầu** — % nghỉ, một dòng tăng / giảm so với kỳ liền trước, đi làm / nghỉ, ca thiếu số, nguồn số; (2) **bảng các tổ** — bảng duy nhất có số từng tổ (đi làm, nghỉ, % nghỉ, tăng / giảm; quân số tổ, ca và lý do nghỉ ghi ngay dưới tên tổ; xem theo tháng thì nghỉ TB mỗi ngày lấy một chữ số lẻ), tổ hai ca mà ca kia chưa có số thì ghi *còn N người chưa có số*; (3) **bảng màu** tổ × 7 ngày hoặc × 4 tháng — cách so sánh duy nhất, chạm ô để sang kỳ đó; (4) **nghỉ theo lý do**. Cách tính thu vào nút *Cách tính*.
- **Cùng một cách đếm với báo cáo ca**: thẻ đầu ghi *x/y tổ có số*; ca đang diễn ra thì tổ chưa báo **tạm lấy số thiết lập** (như báo cáo ca), nên hai màn ra cùng một số.
- **Đếm theo công** (một người trong một ca). **OFF luân phiên tính là nghỉ.** *% nghỉ = công nghỉ ÷ (công đi làm + công nghỉ)*; % của toàn bộ thì cộng công mọi tổ rồi mới chia.
- **Tiểu đội trưởng** vào là thấy thẳng tổ mình, gọn: % nghỉ tháng và tăng / giảm so tháng trước, lịch tháng tô màu, nghỉ theo lý do. Không có bảng so sánh, ngưỡng, nguồn số.
- **Ngưỡng tô đỏ** (mặc định 15%): CVKTHT trở lên đổi được (dòng *Tô đỏ khi nghỉ từ …*). Nút **Chép tóm tắt** ra chữ để dán Zalo.
- **Số của ca tổ không báo**: hết ca nào, app (lịch chạy mỗi giờ) tự chép ca đó cho tổ làm ca đó mà không báo — có số thiết lập thì lấy số đó (kèm người nghỉ theo lý do), không có thì ghi là **ca thiếu số** (bảng `quan_so_tl`, bản cấu trúc 39). Sửa số thiết lập sau đó không đổi số của ca đã qua. Ca đã qua trước khi có tính năng này, hoặc hết ca trước lúc tổ đặt lịch ca, thì không chép được: các tháng cũ chỉ có số tổ tự báo.

### Báo cáo ca gửi cấp trên

Ở **Thêm → Báo cáo ca và quân số các tổ** (hoặc thẻ nhắc trên Tổng quan), từ CVKTHT trở lên. Ngay dưới ô chọn ca là một hàng: **số tổ đã báo** (chạm là tới mục 3) và nút **Chép báo cáo** (thành *Đã chép* / *Chép lại* theo bản đã chép). App ghép sẵn bản **BÁO CÁO QUÂN SỐ CA** đúng mẫu của đơn vị; người soạn soát lại, bấm **Chép báo cáo** rồi dán vào nhóm Zalo.

- **Chọn ca**: mở ra là ca đang diễn ra; ngay dưới tiêu đề có *‹ ngày ›* để đổi ngày và hai nút **Ca ngày / Ca đêm** để đổi ca (ca chưa tới thì khoá); đang xem ca khác thì có dòng *Về ca đang diễn ra*. Ca đêm dùng cùng mẫu, tiêu đề ghi *CA 2 Từ 18h30 đến 6h30*. Soạn được các ca trong 7 ngày gần đây.
- **Phần đầu** (đơn vị, Đại đội trưởng, Trung đội trưởng, CBPT, dự án, khu vực thi công): điền một lần, ba ô chỉ huy có nút **chọn nhanh** từ tài khoản có sẵn (Đại đội trưởng, Trung đội trưởng, CVKTHT). Lần chép nào cũng lưu lại làm mẫu, các ca sau phần này thu gọn thành một dòng. *Tổng số tổ* = số Tiểu đội trưởng.
- **Các mục điền sẵn từ số liệu app**:

  | Mục | Lấy từ |
  |---|---|
  | 3. Quân số | Quân số đầu ca. **Tổ làm ca đang báo cáo đứng trước**, mỗi tổ ghi đi làm / tổng và nghỉ theo lý do. **Tổ làm cả 2 ca ghi thêm ca liền trước** (báo cáo ca ngày kèm ca đêm hôm trước; báo cáo ca đêm kèm ca ngày cùng ngày). **Tổ làm ca kia** dồn xuống cuối, chỉ ghi *(làm ca đêm)*. Tổ chưa báo thì lấy **số thiết lập**, viết như dòng thường. Có nút chọn nguồn: *Theo tổ báo* hoặc *Chỉ số thiết lập* |
  | 4. Công việc trong ngày | Đơn gia công đang làm (*đang gia công 80%*) và đơn xác nhận xong trong giờ ca (*hoàn thành*) |
  | 5. MMTB | Lần chép trước |
  | 6. Kiểm tra, giám sát | Chữ của cùng ca hôm trước; chưa có thì năm dòng mặc định của mẫu |
  | 7. Vướng mắc | Đơn gia công đang báo vướng; không có thì *Hiện tại chưa có* |
  | 8. Đánh giá tiến độ | Đơn gia công trễ hạn; không có thì *Nguy cơ chậm tiến độ: Không có* |

- **Màn hình chính là bản sẽ gửi, chia theo từng phần** (phần đầu, mục 3 → 8). Mỗi phần hiện đúng chữ sẽ gửi, kèm hai nút nhỏ: **chép riêng phần đó** và **sửa** (mở ô sửa tại chỗ, một lúc một phần). Chép cả báo cáo là nút **Chép báo cáo** trên thanh trên cùng; không còn thanh nút to ở đáy. Mỗi dòng là một gạch đầu dòng (gõ thêm "•" cũng không bị thành hai dấu). Phần đã sửa giữ nguyên chữ của người soạn kể cả khi số liệu đổi sau đó; nút *lấy lại số từ app* (mũi tên vòng) để ghép lại theo số mới.
- **Mục 4 soạn theo dòng, bằng chạm**: mỗi đơn gia công một dòng với nút **−10 / +10 / Xong / ×**; đơn còn mở chưa có trong báo cáo hiện thành nút *+ …* để chạm thêm. **Thêm việc ngoài app**: chạm loại cấu kiện (danh mục gia công) hoặc gõ tên, gõ tầng / trục, chạm *đang làm* hoặc *hoàn thành*. Số chỉnh ở đây **chỉ vào báo cáo, không đổi tiến độ đơn gia công**; dòng không chạm vẫn theo số mới nhất của đơn. **Việc tự thêm chưa xong tự mang sang cùng ca hôm sau** (xem *Hôm sau giữ như hôm trước*). % chỉ từ 10 đến 90, *+10* ở 90% là hoàn thành. Dòng đã chỉnh mà tổ báo tiến độ mới sau đó thì app nhắc *Đơn đang … · lấy theo đơn*. Mục 8 theo đúng mục 4: đơn đã đánh *Xong* không còn tính trễ. Hai người cùng soạn thì phần chỉnh ghép theo từng dòng, không mất dòng của nhau; app bản cũ chép cũng không xoá phần chỉnh. Vẫn có *Sửa bằng chữ* cho trường hợp đặc biệt (và *Về soạn theo dòng*).
- **Còn thiếu gì thì nói ngay trên phần đó**: phần đầu ghi *n ô trống* (và tự mở sẵn khi còn trống), máy móc ghi *chưa có* — không có thẻ "còn thiếu" riêng lặp lại. Đại đội trưởng, Trung đội trưởng, CBPT chọn bằng nút tên; ô gõ tay chỉ hiện khi bấm **Khác…**.
- **Hôm sau giữ như hôm trước**: ca chưa ai chép thì báo cáo điền sẵn theo báo cáo đã chép gần nhất **cùng ca** (ca ngày theo ca ngày, ca đêm theo ca đêm), trong 7 ngày trước; người soạn chỉ sửa chỗ đã đổi rồi chép. Giữ: chữ đã sửa của mục 4, 6, 7, 8; phần chỉnh mục 4 theo dòng; nguồn quân số mục 3. Mục 4: % đã chỉnh còn cao hơn số của đơn thì giữ, đơn đã bằng / vượt thì theo đơn; đơn hôm trước báo *hoàn thành* mà đơn chưa đóng thì không lặp lại (về nút *+ …*); đơn đã ẩn, đơn đã thêm, việc ngoài app chưa xong vẫn giữ; hôm trước *Sửa bằng chữ* thì giữ đúng chữ đó. **Không giữ chữ mục 3** (số người đổi từng ca; quân số giữ như cũ đã có số thiết lập). Phần giữ lại ghi nhãn *giữ như ngày …*, không tính là *sửa chưa chép*; nút *lấy lại số từ app* vẫn dùng được. Mục 7 / 8 đang là chữ mà có đơn mới báo vướng / mới trễ hạn chưa nhắc tới thì có nút **+ Thêm N … mới từ đơn gia công**.
- **Dòng kiểm tra của mẫu** (dùng khi chưa có báo cáo cùng ca trong 7 ngày, hoặc khi bấm *lấy lại*) chỉ đổi khi bấm *Đặt các dòng này làm mẫu cho các ca sau*.
- **Tổng hợp quân số mọi tổ ở đầu màn**: *Tổng = Đi làm + Nghỉ + Ca kia + Chưa báo* của ca đang soạn, kèm tổ nào chưa báo. Màn này **tự làm mới** khi có tổ báo thêm (đang mở ô sửa thì đợi đóng ô). Nút **bánh răng** mở thẳng bảng **Thiết lập** (ca và số quân từng tổ, có dòng *Tổng N tổ* chạy theo số đang gõ); Nút quay lại ở đó về đúng báo cáo đang soạn.
- **Bước 3 nói rõ đã chép chưa**: *Chép* (chưa chép), *Đã chép* (bản đang hiện đúng là bản đã chép), *Chép lại* (nội dung đã đổi sau lần chép — tổ báo thêm, đơn gia công đổi, hoặc sửa tay — cấp trên đang có bản cũ).
- Bấm chép (cả báo cáo hay riêng một phần) là **lưu báo cáo của ca đó** (mở lại vẫn thấy, ghi *Đã chép lúc … · người chép*). Đang sửa dở mà thoát hay mất mạng thì nháp vẫn nằm trên máy. Lần chép nào cũng vào nhật ký (chip *Quân số*).
- **Nhiều người cùng soạn**: báo cáo của ca và mẫu (phần đầu, máy móc, dòng kiểm tra) là **một bản dùng chung**; nguồn quân số mục 3 lưu kèm báo cáo. Mỗi máy chỉ giữ riêng **phần sửa chưa chép** (nhãn *sửa chưa chép*, nút *Bỏ phần sửa* để về bản chung). Người khác vừa chép ca đó thì lần chép của mình bị từ chối (*"… vừa chép báo cáo ca này lúc …"*), app tải bản đó về, giữ phần đang sửa, soát rồi chép lại. Phần đầu chỉ lưu các ô đã sửa nên không đè lại mẫu người khác vừa đổi. Máy khác đang mở màn tự lấy bản mới.
- Máy không cho chép tự động thì app báo, chạm giữ vào chữ của phần cần chép để chép tay.

### Điều chỉnh tồn

Ở **Nhập → Điều chỉnh**. Dùng khi **sổ sai** mà không phiếu nào giải thích được: kỳ trước đếm sai, ghi nhầm phiếu, hoặc hụt thép không rõ nguyên nhân. Từ CVKTHT trở lên **lập** được, chỉ cấp 2 (Trung đội trưởng, Đại đội trưởng, Admin) **duyệt**.

- **Đây không phải phiếu xuất.** Thép thật đi hay về thì dùng **Nhập thép về** / **Chuyển khu**; thép rời bãi đi công trình thì ghi **[Phiếu xuất](#phiếu-xuất-tuỳ-chọn)** (hoặc cứ để khu đếm xuống, hệ thống tự tính ra "đã dùng"). Chỉ dùng Điều chỉnh khi con số trong máy **sai** so với thực tế ngoài bãi. Khác nhau ở chỗ: điều chỉnh **sửa sổ** nên nó *không* tính vào lượng dùng, còn phiếu xuất là thép **đi thật** nên nó *nằm trong* lượng dùng.
- Chọn **khu**, chọn **tăng hay giảm**, chọn **phi**, gõ số **luôn dương** (chiều do nút quyết định, không phải gõ dấu trừ), rồi chọn **lý do** — bốn lựa chọn sẵn, "Lý do khác" thì bắt ghi rõ. Lý do nằm trong phiếu và trong **nhật ký mãi mãi**.
- Màn hình nói luôn **"đang có X → còn Y"** ngay khi gõ, và báo đỏ nếu giảm quá số khu đang thực có.
- **Không giảm quá số khu đang thực có.** Chặn cả lúc lập và lúc duyệt, vì lúc lập còn đủ không có nghĩa lúc duyệt còn đủ. Nhiều phiếu giảm đang chờ duyệt cũng không cùng rút một lô thép được: phiếu chờ duyệt đã giữ phần thép đó, nên tồn khu không bao giờ âm.
- Điều chỉnh **quá 20 tấn** phải gõ đúng `DONG Y` mới lưu được. Mốc này cố ý để cao: một bó D16 đã là 3,3 tấn, nếu chặn từ vài tấn thì gần như lần sửa sổ nào cũng bị đòi gõ tay — cổng nào cũng kêu thì người dùng gõ cho xong và cổng hết tác dụng.
- Duyệt xong, phi đó **không "giữ nguyên" được nữa**: khu buộc phải ra đếm thật để xác minh con số vừa sửa.
- **Lượng dùng không bị ảnh hưởng.** Sửa sổ giảm 300 cây rồi khu đếm lại thấy đúng số mới thì "đã dùng" ra **0**, không phải 300. Đây là lý do tính năng này làm bằng một phiếu chứ không phải sửa thẳng số đếm: sửa thẳng số đếm thì phần chênh thành một cú "đã dùng" khổng lồ, nó vào mức dùng trung bình và kéo cảnh báo *"dùng nhiều bất thường"* sai suốt 28 ngày sau — đúng cái bẫy mà mục **Đặt tồn về 0** cũng phải tránh.
- **Không trộn vào cột Nhập.** Báo cáo theo kỳ có **cột Điều chỉnh riêng** (cả trong app lẫn trong CSV), nên mỗi kỳ đọc được ngay "tháng này sổ bị sửa bao nhiêu tấn". Gộp vào Nhập là biến tính năng này thành chỗ giấu chênh lệch. Đẳng thức vẫn khép kín: **Tồn đầu + Nhập + Điều chỉnh − Dùng = Tồn cuối**.
- Nhật ký có **chip lọc "Điều chỉnh"** riêng, không nằm trong nhóm "Nhập kho".
- Hoàn tác như mọi phiếu: người lập **rút lại** khi chưa duyệt, cấp chỉ huy **từ chối** phiếu chờ hoặc **huỷ** phiếu đã duyệt cho tới khi ngày duyệt bị chốt.

### Phiếu xuất (tuỳ chọn)

Ở **Nhập → Xuất kho**. Từ CVKTHT trở lên **lập** được, chỉ cấp 2 (Trung đội trưởng, Đại đội trưởng, Admin) **duyệt**.

**Ghi phiếu xuất là tuỳ bạn.** Không ghi thì app chạy y như trước: lượng dùng vẫn suy ra từ *tồn cũ + nhập − đếm*. Phiếu xuất không thay phép tính đó, nó chỉ **giải thích** được bao nhiêu phần trong đó. Ghi được bao nhiêu thì phần **"không rõ"** co lại bấy nhiêu — và chính phần không rõ mới là con số đáng đi hỏi.

- Bắt buộc ghi **xuất cho ai / công trình nào**. Phiếu xuất không nói thép đi đâu thì không thêm được gì so với con số app đã tự suy ra, nên app từ chối.
- **Không xuất quá số khu đang thực có.** Chặn cả lúc lập và lúc duyệt, dùng chung chốt chặn với Chuyển khu và Điều chỉnh: phiếu đang chờ duyệt đã giữ phần thép đó, nên hai phiếu xuất không cùng rút một lô thép được.
- **Phải cấp chỉ huy duyệt** mới trừ vào tồn. Lý do không phải hình thức: một phiếu xuất làm số **dự kiến** của khu tụt xuống, tức nó đổi chính cái thước mà cấp chỉ huy dùng để soi khu đó. Nếu tự ghi phiếu xuất là tự hạ thước thì ghi phiếu xuất thành cách xoá dấu vết hụt thép.
- Màn **Duyệt** tách con số ra: *"đã dùng 1.300 — trong đó 1.100 có phiếu xuất, 200 không rõ đi đâu"*.
- **Lượng dùng vẫn là TỔNG.** Xuất 1.100 có phiếu mà khu đếm hụt 1.300 thì "đã dùng" là **1.300**, không phải 200. Đây là chỗ dễ sai nhất: nếu để phần xuất nằm trong vế "Nhập" thì nó tự triệt tiêu với phần khu đếm hụt, "đã dùng" tụt còn đúng phần không có phiếu, mức dùng trung bình thấp hơn thực tế, rồi dự báo *"còn đủ dùng bao nhiêu ngày"* nói dư ra — **càng ghi phiếu đầy đủ thì dự báo càng sai**, đúng chiều ngược với mục đích.
- Báo cáo kỳ có **cột "Có phiếu"** riêng (app) và cột **"Có phiếu xuất"** trong CSV. Cột này **nằm trong** cột Dùng, không cộng thêm, nên đẳng thức vẫn khép kín: **Tồn đầu + Nhập − Dùng = Tồn cuối**.
- Nhật ký ghi **nơi đến** của từng phiếu, nên tra lại được "tháng này xuất cho công trình nào bao nhiêu".
- Hoàn tác như mọi phiếu: người lập **rút lại** khi chưa duyệt, cấp chỉ huy **từ chối** phiếu chờ hoặc **huỷ** phiếu đã duyệt cho tới khi ngày duyệt bị chốt.

### Sổ ngày tự chốt

Không có nút chốt. Việc của người duyệt trong ngày chỉ là **duyệt**: từng khu, và các phiếu. Ngay sau nửa đêm (lần chạy 0h05), hệ thống tự chốt sổ của ngày vừa qua:

- **Chỉ số đã duyệt vào sổ**, như trước. Tồn chuẩn, lượng dùng của ngày, mức dùng trung bình 28 ngày và báo cáo kỳ đều có số đều đặn mỗi ngày, không còn ngày bị gộp vì quên chốt.
- **Việc còn treo không chặn chốt** mà được tự ghi vào nhật ký của lần chốt: khu chưa báo, khu thiếu lần đếm, hai người báo khác số, phiếu chờ duyệt... **Xem lại ngày cũ** hiện đủ.
- **Báo cáo chưa duyệt lúc 0h không mất**: nó chuyển sang ngày mới, vẫn chờ duyệt, giữ nguyên **giờ đếm thật** (thẻ khu ghi *"báo ngày …"*). Duyệt sáng hôm sau là vào tồn; khu đếm mới trong ngày thì số mới thay số cũ. Ngày hôm trước thì khu đó giữ số đã duyệt trước, nên phần dùng của khu dồn sang ngày được duyệt — tổng nhiều ngày vẫn khớp.
  - **Ngày bị dồn số được đánh dấu**, để không ai so từng ngày rồi tưởng hôm trước không dùng thép còn hôm sau dùng gấp đôi: **Xem lại ngày cũ** có thẻ *"Ngày bị dồn số"* ghi khu nào dồn sang ngày sau / nhận số từ hôm trước; danh sách *Theo ngày* của **báo cáo kỳ** và **Thống kê** có dòng *"Dồn số: …"* dưới đúng hai ngày đó.
  - **Nhắc duyệt trước 0h**: hết giờ làm (giờ kết thúc ở Cài đặt → Quy tắc, mặc định 18h) mà còn báo cáo hôm nay chưa duyệt thì thẻ *"… chờ bạn duyệt"* của người duyệt chuyển đỏ và nói hạn 0h. Đây là cách chữa tận gốc: duyệt trong ngày thì không có gì dồn.
- **Nhãn số mốc khi đếm nói đúng nguồn**: bảng số của một phi ghi *"Hôm qua: …"* chỉ khi số đó là tồn chuẩn hôm qua; số là lần đếm đã duyệt trong ngày thì ghi *"Đã duyệt lúc HH:MM: …"* (đếm nhiều lần/ngày, buổi chiều không còn đọc số sáng nay thành số hôm qua).
- **Phiếu chờ duyệt** nằm chờ qua đêm như trước và vào sổ đúng ngày được duyệt.
- **Ngày bất thường** của một phi (dùng âm, dùng cao bất thường — thường do quên nhập phiếu) vẫn chốt và vẫn hiện trong báo cáo, nhưng **không tính vào mức dùng trung bình**, để câu *"còn đủ dùng N ngày"* không sai suốt 4 tuần vì một lần quên. Phi không còn ngày nào hợp lệ trong 28 ngày thì mức dùng trung bình cũ bị **xoá** (về *chưa đủ dữ liệu*), không treo lại số của hàng tháng trước.
- Cloudflare lỡ một lần chạy thì **giờ sau tự bù**; lỡ nhiều ngày thì mỗi giờ bù một ngày, ngày nào riêng ngày đó.
- **Không mở lại được ngày đã chốt.** Sổ ngày cũ mà phát hiện sai thì lập phiếu [Điều chỉnh tồn](#điều-chỉnh-tồn): sửa con số **hiện tại** và để lại dấu vết. Sai trong **hôm nay** thì cứ đếm lại / duyệt lại — hôm nay chưa chốt cho tới 0h.
- Riêng **Đặt lại số liệu** (kiểm kê lại) vẫn khoá ngày hôm đó và **hoàn tác được trong ngày** ở màn Duyệt.

### Sao lưu toàn bộ

Ở **Thêm → Cài đặt → Dữ liệu thép**, chỉ **admin đầu tiên** thấy.

- **Tải bản sao toàn bộ (JSON)** — một tệp chứa tất cả: phi, khu, tài khoản, số đếm, phiếu, các ngày đã chốt, tồn chuẩn, cài đặt và nhật ký. Khác hai tệp CSV ở chỗ nó **nạp lại được**, nên đây mới là đường lùi thật. Nên tải định kỳ và cất ra ngoài máy chủ.
- **Nạp lại từ bản sao** — thay **sạch** số liệu hiện tại bằng số liệu trong tệp, không trộn. Phải chọn tệp, gõ `NAP LAI`, rồi còn một hộp xác nhận. Chỉ nạp được bản sao **cùng phiên bản cấu trúc**: nạp bản sao của cấu trúc cũ vào bảng đã đổi cột là hỏng kiểu không sửa được, nên hệ thống từ chối thẳng. Ngoại lệ chỉ có khi bản mới **chỉ thêm bảng hoặc cột** so với bản liền trước; bản hiện tại (cấu trúc 23) đổi mã vai trò và ghi thêm cấp người báo nên **không nhận bản sao cũ hơn**.
- **Nhật ký không bị thay.** Database không cho xoá nhật ký, nên nạp lại chỉ có thể cộng thêm, tức nhân đôi lịch sử. Vì vậy nạp lại giữ nguyên nhật ký đang có và ghi thêm một dòng nói rõ vừa nạp từ bản sao nào.
- Tài khoản và PIN cũng nằm trong bản sao (PIN đã băm). Băm đó vô dụng nếu không có `PEPPER`, mà `PEPPER` chỉ nằm trên máy chủ chứ không nằm trong tệp. **Nhưng** ai được tạo sau ngày sao lưu sẽ mất tài khoản khi nạp lại.
- Cỡ bản sao: đo thực tế **60 ngày ≈ 2,7 MB**, suy ra khoảng **16 MB một năm**. Nhật ký và lịch sử đếm có trần 20.000 dòng gần nhất nên không phình vô hạn. Nếu bãi chạy nhiều năm thì nên xem lại chỗ này.

### Đặt lại số liệu thép

Hai việc khác nhau, nằm ở **Thêm → Cài đặt → Dữ liệu thép**, chỉ **admin đầu tiên** thấy:

- **Đặt tồn về 0 (kiểm kê lại)** — ghi một mốc *cả bãi = 0* cho hôm nay. Lịch sử và **báo cáo theo kỳ cũ vẫn xem được**; thống kê tính lại từ mốc này. Hôm nay thành **đã chốt**, từ mai đếm và nhập bình thường từ 0. Bấm nhầm thì vào **Duyệt → Mở lại ngày hôm nay**: tồn và các báo cáo của hôm nay trở lại **đúng như trước**. Hoàn tác được là vì lúc đặt lại hệ thống **chụp lại** số đếm và dấu "khu đã báo" của ngày đó; thiếu ảnh chụp thì hoàn tác chỉ còn cách lùi về tồn chuẩn cũ, mà ngày chưa có lần chốt nào trước đó thì không có tồn chuẩn nào để lùi và số liệu gốc mất hẳn. Lượng dùng của ngày đặt lại để **trống** chứ không ghi số: nếu ghi thì chênh lệch giữa tồn cũ và 0 thành một cú "đã dùng" khổng lồ, nó vào mức dùng trung bình và kéo cảnh báo "dùng nhiều bất thường" sai suốt 28 ngày sau. Vì vậy **báo cáo kỳ** có ngày đặt lại thì có thêm cột **Đặt về 0** (số âm: tồn ngày chốt trước cộng mọi thứ vào/ra trong ngày đặt lại), cả trong app lẫn trong CSV, kèm dòng ghi ngày đặt lại. Đẳng thức đầy đủ: **Tồn đầu + Nhập + Điều chỉnh + Vay mượn + Đặt về 0 − Dùng = Tồn cuối**.
- **Xoá sạch dữ liệu thép** — xoá mọi số đếm, tồn chuẩn, phiếu, ngày đã chốt và bảng tổng hợp; bãi trở lại như mới dựng, lần chốt tiếp theo tạo tồn chuẩn đầu tiên. **Báo cáo theo kỳ cũ mất theo và KHÔNG hoàn tác được.** Dùng khi chạy thử xong, bắt đầu dùng thật. Phải gõ đúng `XOA SACH` để mở nút, rồi còn một hộp xác nhận nữa.
- Cả hai **không chạm được nhật ký và lịch sử đếm** (database chặn mọi lệnh xoá hai bảng đó). Nhờ vậy dòng nhật ký của chính lần đặt lại ghi kèm **tổng số thép trước khi xoá theo từng phi** — đó là chỗ đọc lại được số cũ, kể cả sau khi đã xoá sạch.
- Giữ nguyên: tài khoản, khu, cấu hình phi, cài đặt. Nên **tải bản sao CSV** trước khi đặt lại (có nút ngay cạnh).


---

## Deploy lên Cloudflare (làm một lần, khoảng 15 phút)

**Cần có:** tài khoản Cloudflare miễn phí (https://dash.cloudflare.com/sign-up) và Node.js 20 trở lên (https://nodejs.org).

Mở Terminal (Windows: PowerShell) trong thư mục dự án này rồi chạy lần lượt:

### 1. Cài công cụ
```
npm install
npx wrangler login
```
Trình duyệt mở ra, bấm **Allow** để cho phép.

### 2. Tạo cơ sở dữ liệu D1
```
npx wrangler d1 create kho-thep
```
Lệnh in ra một đoạn có dòng `database_id = "xxxxxxxx-xxxx-..."`. Mở file **wrangler.toml**, thay `THAY_BANG_DATABASE_ID` bằng chuỗi đó.

### 3. Tạo bảng và dữ liệu mặc định
```
npx wrangler d1 execute kho-thep --remote --file=schema.sql
```
(Có hỏi xác nhận thì gõ `y`.)

### 4. Deploy
```
npx wrangler deploy
```
Cuối lệnh có địa chỉ dạng `https://khothep.<ten-cua-ban>.workers.dev` (phần đầu là `name` trong `wrangler.toml`, hiện là `khothep`). Đó là địa chỉ ứng dụng.

### 5. Đặt hai bí mật (bắt buộc)
Tạo hai chuỗi ngẫu nhiên:
```
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```
Chạy lệnh này **hai lần**, ghi lại hai chuỗi. Sau đó:
```
npx wrangler secret put PEPPER
npx wrangler secret put SETUP_TOKEN
```
Mỗi lệnh sẽ hỏi giá trị, dán một chuỗi vào rồi Enter (PEPPER là chuỗi thứ nhất, SETUP_TOKEN là chuỗi thứ hai).

> **PEPPER** dùng để băm PIN. Hãy lưu nó ở nơi an toàn. **Nếu mất hoặc đổi PEPPER, mọi PIN sẽ không dùng được nữa** (phải đặt lại PIN cho từng người).

### 6. Tạo admin đầu tiên
Mở `https://khothep.<ten-cua-ban>.workers.dev/setup`, nhập SETUP_TOKEN, tên, số điện thoại, PIN 4 số. Trang này chỉ dùng được một lần, có admin rồi hệ thống tự từ chối.

### 7. Thiết lập ban đầu trong ứng dụng
Đăng nhập admin, vào **Thêm**:
1. **Cài đặt**: đổi tên khu, thêm/ẩn khu theo bãi thực tế (mặc định có Khu A → H). Với từng phi, đặt **số cây mỗi bó**, **mức tồn tối thiểu** và **kg/cây** (mặc định theo 0,00617 × D² × 11,7 m, sửa theo trọng lượng thực tế nhà máy nếu khác).
2. **Người dùng và PIN**: tạo tài khoản cho từng người và chọn đúng vai trò (Tiểu đội trưởng, CVKTHT, Trung đội trưởng, Đại đội trưởng). Hệ thống tạo PIN ngẫu nhiên hiện **một lần**, đưa cho người dùng. Họ phải tự đổi PIN khi đăng nhập lần đầu.
3. Ngày đầu tiên: các khu báo cáo hết, người duyệt vào **Duyệt** và duyệt từng khu. Sau 0h sổ tự chốt, số đã duyệt hôm đó trở thành tồn chuẩn đầu tiên; từ ngày sau hệ thống tính lượng dùng.

### 8. Cài lên điện thoại
- **Android (Chrome):** mở địa chỉ → menu ⋮ → **Thêm vào Màn hình chính** (hoặc **Cài đặt ứng dụng**).
- **iPhone (Safari):** mở địa chỉ → nút Chia sẻ → **Thêm vào Màn hình chính**.

---

## Việc thường làm

| Việc | Lệnh / cách làm |
|---|---|
| Cập nhật code sau khi sửa | `npx wrangler deploy` (chạy từ nhánh `main` sạch, không có thay đổi chưa commit). **Đẩy lên GitHub KHÔNG tự deploy** — dự án chưa nối Cloudflare Workers Builds. Máy đang mở app sẽ tự hiện dải "Có bản mới" |
| Nâng cấp cấu trúc database | **Tự động**: Worker tự áp dụng thay đổi ở lần chạy đầu sau deploy (số phiên bản lưu ở bảng `meta`, khoá `schema`). Không cần chạy lại `schema.sql` |
| Sao lưu dữ liệu ra file | `npx wrangler d1 export kho-thep --remote --output=backup.sql` |
| Khôi phục về thời điểm cũ | Cloudflare Dashboard → Storage & Databases → D1 → kho-thep → **Time Travel** (khôi phục theo từng phút, thời hạn lưu tuỳ gói, xem trang giá D1 của Cloudflare) |
| Xem lỗi trực tiếp | `npx wrangler tail` |
| Gắn tên miền riêng | Dashboard → Workers & Pages → kho-thep → Settings → **Domains & Routes** |
| Quên PIN | Admin vào **Người dùng và PIN → Đặt lại PIN** |
| Mất điện thoại | Admin **Khoá** tài khoản hoặc **Đăng xuất máy**, thiết bị bị đăng xuất ngay |
| Người nghỉ việc | Admin đầu tiên vào **Người dùng → Xoá tài khoản**. Hoạt động cũ vẫn giữ nguyên tên họ |
| Đặt sai tên tài khoản | Admin đầu tiên vào **Người dùng → Sửa tên**. Số đếm và phiếu cũ hiện tên mới ngay |
| Chạy thử xong, muốn dùng thật | Admin đầu tiên vào **Cài đặt → Dữ liệu thép → Xoá sạch**. Tải bản sao CSV trước |
| Kiểm kê lại cả bãi | **Cài đặt → Dữ liệu thép → Đặt tồn về 0**. Lịch sử cũ vẫn giữ, hoàn tác được |
| Sổ ngày cũ sai | **Nhập → Điều chỉnh**: sửa số hiện tại, để lại dấu vết. Ngày đã chốt không mở lại được |
| Đặt lại số liệu nhầm | **Duyệt → Hoàn tác đặt lại số liệu**, trong cùng ngày |
| Sổ sai một phi ở một khu | **Nhập → Điều chỉnh**, chọn tăng/giảm và lý do, rồi cấp chỉ huy duyệt. Không ảnh hưởng lượng dùng |
| Xuất thép đi công trình | **Nhập → Xuất kho** (tuỳ chọn), ghi rõ nơi đến, rồi cấp chỉ huy duyệt. Không ghi cũng được — app vẫn tính lượng dùng |
| Giao việc gia công cho tiểu đội | Tab **Gia công → Giao đơn mới** (CVKTHT trở lên): cấu kiện, trục, người nhận, ngày cần xong. Tiểu đội trưởng tự nhận, cập nhật tiến độ và xác nhận xong; ai cũng xem được |
| Báo quân số đầu ca | Thẻ **Quân số tổ** đầu Tổng quan: Tiểu đội trưởng khai báo ca, tổng quân số và báo tổ mình ở đầu mỗi ca (nghỉ theo lý do, đi làm). CVKTHT trở lên xem mọi tổ ở bước 1 của màn Báo cáo ca |
| Vay / cho đối tác vay thép | **Thêm → Vay mượn ngoài bãi** (hoặc lối tắt ở màn Nhập), chọn *thép qua bãi* + khu nếu thép đi qua cổng. Cấp chỉ huy duyệt. Không tính là nhập hay dùng |

Nên sao lưu `backup.sql` định kỳ (ví dụ mỗi tuần) và cất ngoài Cloudflare.

## Chạy thử trên máy (không ảnh hưởng dữ liệu thật)
```
copy .dev.vars.example .dev.vars        (Mac/Linux: cp .dev.vars.example .dev.vars)
npm run db:local
npm run dev
```
Mở http://localhost:8787/setup để tạo admin thử.

## Hạn mức gói miễn phí (50 người dùng vẫn đủ)

| Hạng mục | Miễn phí | Ứng dụng này dùng |
|---|---|---|
| Workers | 100.000 yêu cầu/ngày (reset 7:00 sáng giờ VN) | Dưới 15.000: máy hỏi số phiên bản mỗi 60 giây khi đang dùng, 5 phút khi để yên, 15 phút ngoài giờ (20:00–6:00), không hỏi khi app chạy nền |
| D1 truy vấn mỗi yêu cầu | 50 | Hỏi phiên bản 1 câu; tải dữ liệu chung 26 câu trong 2 lượt gọi; gửi báo cáo cả khu 19; "Duyệt tất cả" khoảng 34, không tăng theo số khu hay số phiếu chờ (ghi hàng loạt bằng một câu lệnh `json_each`) |
| Cron | 5 | 1 (mỗi giờ: tự chốt sổ ngày đã qua + dọn dẹp) |
| D1 đọc | 5 triệu dòng/ngày | Khoảng 900 dòng mỗi lần tải dữ liệu chung, 200 dòng mỗi lần gửi báo cáo, không tăng theo số năm dữ liệu (riêng Tìm nhật ký theo chữ, báo cáo "từ ngày đầu" và Sao lưu đọc cả bảng) |
| D1 ghi | 100.000 dòng/ngày | Vài trăm đến vài nghìn |
| D1 dung lượng | 500 MB mỗi database | Khoảng 12 MB/năm (8 khu × 13 phi, chưa kể nhật ký) |
| Giao diện tĩnh | Không giới hạn | |

Nếu Cloudflare chặn do hết hạn mức trong ngày, app vẫn mở được và hiện số liệu lần tải gần nhất, báo cáo đếm được giữ lại để gửi sau. Nếu sau này thường xuyên vượt hạn mức, gói Workers Paid 5 USD/tháng gỡ các giới hạn này, không cần sửa code.

## Bảo mật đã có
- PIN băm kèm PEPPER, không lưu PIN thật. Sai 5 lần khoá 15 phút, tái phạm khoá 1 giờ rồi 24 giờ. Một thiết bị (IP) sai quá 30 lần/ngày bị chặn đến hôm sau. Cookie `HttpOnly`, `Secure`, `SameSite=Strict`.
- Quyền kiểm tra ở server cho từng thao tác, không chỉ ẩn nút trên giao diện.
- Chặn gửi yêu cầu từ trang web lạ (kiểm tra Origin).
- Mọi thao tác ghi vào nhật ký (ai, làm gì, số cũ → số mới, lúc nào).

## Chưa có trong bản 1.3
- Ảnh phiếu nhập (cần thêm Cloudflare R2).
- Thông báo đẩy nhắc khu chưa báo (Web Push; Cron đã có sẵn).

## Cấu trúc thư mục
```
wrangler.toml        cấu hình Cloudflare (nhớ điền database_id)
schema.sql           cấu trúc database + dữ liệu mặc định
src/worker.js        điểm vào: định tuyến /api/* và Cron mỗi giờ
src/core.js          tiện ích, giờ Việt Nam, hằng số, phi mặc định
src/db.js            tự nâng cấp database (migration, SCHEMA_VERSION)
src/helpers.js       hàm dùng chung: đọc request, CSV, nhật ký, phiên, cài đặt
src/slots.js         khung giờ đếm (đếm nhiều lần/ngày)
src/auth.js          đăng nhập, PIN, thiết lập
src/bootstrap.js     dữ liệu chung cho máy khách
src/counts.js        báo cáo đếm, hai người báo khác số, nhật ký, tệp CSV ngày
src/phieu.js         nhập, chuyển, xuất, điều chỉnh tồn
src/loans.js         sổ vay mượn ngoài bãi
src/satvun.js        sổ xuất sắt vụn ra ngoài (chỉ khối lượng, không tính vào tồn)
src/quanso.js        quân số đầu ca của từng tổ (ca ngày, ca đêm)
src/baocao.js        báo cáo ca gửi cấp trên (gom số liệu, lưu báo cáo và mẫu)
src/review.js        màn Duyệt, tự chốt sổ sau 0h, hoàn tác đặt lại số liệu
src/data.js          đặt lại số liệu, sao lưu, nạp lại
src/admin.js         người dùng, khu, phi, cài đặt
src/reports.js       xem ngày cũ, báo cáo theo kỳ
public/              giao diện: index.html, app.js, style.css, sw.js, manifest, biểu tượng, setup.html
```

## Gỡ lỗi nhanh
- *"Chưa cấu hình PEPPER"*: chưa chạy bước 5.
- *"Mã thiết lập sai"*: SETUP_TOKEN nhập không khớp với giá trị đã đặt.
- *Đăng nhập báo sai dù đúng PIN sau khi đổi PEPPER*: PEPPER đã bị đổi, cần đặt lại PIN từng người.
- *Lỗi khi chạy `d1 execute --remote`*: kiểm tra `database_id` trong wrangler.toml đã đúng chưa.
- *Báo "Mạng quá chậm…" khi lưu*: mỗi lời gọi máy chủ có hạn chờ 20 giây (trước đây sóng yếu là treo mãi ở "Đang lưu..."). Báo cáo đếm và quân số tự xếp hàng gửi lại; các thao tác khác thì xem lại đã lưu chưa rồi bấm lại. Phiếu kho (nhập, chuyển, xuất, điều chỉnh) bấm lại cùng nội dung **không sinh phiếu thứ hai**: mỗi phiếu đã xác nhận mang một khoá chống ghi trùng (`khoa`, xem `receiptCtx` ở `src/phieu.js`).
- *Lưu chậm*: một lần lưu chỉ còn **một vòng mạng** — lệnh ghi gửi kèm tiêu đề `X-Kem` (các đường GET màn đang đứng sắp tải lại) và server trả luôn kết quả trong khoá `sau` (xem `kemSau` ở `src/worker.js`, `sauGhi` ở `public/app.js`). Mở tab Network mà thấy sau lệnh ghi vẫn còn `GET /api/bootstrap` thì phần kèm đang không chạy (xem log Worker, dòng `kemSau`).
- *Mở app trắng màn hình khi sóng yếu*: service worker chờ mạng tối đa 4 giây rồi dùng bản giao diện đã lưu trong máy; bản mới tải ngầm cho lần mở sau.
- *Giao diện không cập nhật sau khi deploy*: app tự phát hiện bản mới (so dấu ETag của `/app.js` mỗi 5 phút và mỗi lần mở lại từ nền) rồi hiện dải **"Có bản mới của app. Bấm vào đây để cập nhật"**. Bấm vào là xong. Máy còn chạy bản cũ mà gửi kiểu cũ lên thì server báo thẳng "bản app trên máy đã cũ". Khi sửa giao diện vẫn nên tăng số `CACHE` trong `public/sw.js`.
