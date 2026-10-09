# Kho Thép Bãi

Ứng dụng web (PWA) quản lý tồn kho thép bê tông cốt thép D6 → D36 trên bãi, chạy hoàn toàn trên Cloudflare (gói miễn phí): **Workers + D1 + Static Assets**. Không cần VPS.

## Cách hệ thống tính

- Mỗi ô **(ngày × khu × phi)** là đơn vị gốc. Mọi thống kê (toàn bãi, theo khu, theo phi) tính từ các ô này.
- Hằng ngày mỗi khu báo số đếm thực tế (bó + cây lẻ). **Mọi khu luôn hiện đủ phi D6 → D36**; phi khu không có thì cứ **để trống**, hệ thống hiểu là 0. Không phải gõ 0 cho chín phi không có.
- **Chưa duyệt thì không vào tồn.** Đây là quy tắc trung tâm, áp cho cả báo cáo đếm lẫn phiếu nhập/chuyển: tồn của một khu luôn bằng **báo cáo mới nhất ĐƯỢC DUYỆT** của khu đó, không liên quan khu khác. Khu báo lại số mới mà chưa ai duyệt thì tồn vẫn là số đã duyệt trước đó.
- **Đã dùng = Tồn chuẩn hôm qua + Nhập trong ngày − Tổng đếm hôm nay** (tính ở cấp toàn bãi, **không ai phải nhập phiếu xuất**). Muốn biết thép đi đâu thì ghi **phiếu xuất** — tuỳ chọn, không bắt buộc, và nó **không thay phép tính này**, chỉ tách con số "đã dùng" thành phần *có phiếu* và phần *không rõ*. Xem mục [Phiếu xuất](#phiếu-xuất-tuỳ-chọn). Vế "Tổng đếm" ở đây là **số đếm**, không phải số đang có — phần nhập đã nằm ở vế "Nhập" rồi, cộng vào cả hai vế là tính trùng.
- **Thép đang có** của một khu = số đếm đã duyệt gần nhất **+ phiếu đã duyệt sau lần đếm đó**. Đã duyệt thì phải vào tồn, nên một khu vừa nhận thép đã duyệt mà chưa kịp đếm vẫn thấy ngay ở Tổng quan và Tồn bãi, khớp với số "dự kiến" mà màn Đếm đang hiện. **Tệp xuất CSV và màn Xem lại ngày cũ** cũng tính đúng con số đó cho ngày chưa chốt; ngày đã chốt thì tồn chuẩn là số chính thức.
- **Duyệt theo từng khu, độc lập.** Màn Duyệt bày cho mỗi khu một bảng *dự kiến → khu báo → lệch*, rồi admin bấm **Duyệt khu**. Lệch to hay nhỏ chỉ đổi màu chữ để dễ thấy, **không** quyết định khu có duyệt được hay không — khu nào đã báo cũng duyệt được. Duyệt khu nào thì duyệt luôn phiếu đang chờ của khu đó, trong cùng một lần ghi.
- Admin vẫn được nhắc riêng những việc không duyệt được bằng một nút: khu chưa báo, hai người báo khác số, khu đang chờ đếm lại, phi dùng âm hoặc dùng quá 3 lần mức bình thường.
- **Để trống phi đang có thép** thì app hỏi lại ngay lúc gửi (*"gửi là ghi 0, đúng chưa?"*), và màn Duyệt đánh dấu riêng ô đó cho người duyệt thấy. Phi dự kiến đang 0 mà để trống thì không hỏi gì.
- Chốt ngày thì khóa số liệu, số **đã duyệt** hôm đó trở thành **tồn chuẩn** cho ngày sau. Chốt nhầm thì **mở lại** được — nhưng chỉ **lần chốt gần nhất**, xem mục [Mở lại ngày đã chốt](#mở-lại-ngày-đã-chốt).
- **Đếm nhiều lần/ngày (tuỳ chọn, bắt buộc khi bật)**: admin đặt mỗi khu phải đếm 1–4 lần/ngày. Từ 2 lần trở lên, khung giờ đã qua mà khu chưa đếm thì chặn chốt ngày như một việc chưa xử lý. Xem mục [Đếm nhiều lần mỗi ngày](#đếm-nhiều-lần-mỗi-ngày).
- **Tự chốt lúc 23:50** nếu đủ khu đã báo và không còn việc nào chờ duyệt. Ngày có bất thường thì không tự chốt, nhật ký ghi lý do. Tắt/bật ở **Cài đặt**.
- Quên chốt vài ngày: lượng dùng được gộp cho cả khoảng đó, cảnh báo "dùng nhiều" tự chia theo số ngày.
- Mất mạng khi gửi báo cáo: app lưu báo cáo kèm **ngày đếm** và tự gửi lại khi có mạng. Nếu đã sang ngày mới, báo cáo hiện ở Tổng quan để người dùng chọn *Gửi làm số hôm nay* hoặc *Bỏ*, không tự ghi vào sai ngày.
- **Nhập kho** một phiếu được nhiều phi, có hộp xác nhận trước khi lưu. Mọi nút lưu đều bị khóa trong lúc đang gửi nên bấm đúp không tạo phiếu trùng.
- **Mọi phiếu đều chờ admin duyệt**, kể cả phiếu admin tự nhập. Phiếu ghi **cả ngày nhập và ngày duyệt**, và tính vào tồn theo **ngày duyệt**: thép về chiều ngày 7 duyệt sáng ngày 8 thì nằm trong số liệu ngày 8, chứng từ vẫn ghi đủ hai mốc. Nhờ vậy phiếu treo qua đêm không cần chặn chốt ngày.
- Người lập **rút lại** phiếu chưa duyệt bất cứ lúc nào; phiếu đã duyệt thì chỉ hoàn tác được trong 10 phút kể từ **lúc duyệt**, sau đó nhờ admin. Admin **từ chối** phiếu chờ duyệt, hoặc **huỷ** phiếu đã duyệt cho tới khi ngày duyệt bị chốt.
- **Chuyển khu** (Nhập → Chuyển khu): ghi một dòng âm ở khu đi, một dòng dương ở khu đến. Tổng toàn bãi không đổi nên lượng dùng không bị ảnh hưởng.
- **Điều chỉnh tồn** (Nhập → Điều chỉnh): sửa tồn một ô (khu × phi) khi **sổ sai** mà không phiếu nào giải thích được. Bắt buộc chọn **lý do**, phải **admin duyệt** mới vào tồn, và **không giảm quá số khu đang thực có**. Xem mục [Điều chỉnh tồn](#điều-chỉnh-tồn) bên dưới.
- Khi đếm, ô chưa chạm tới hiện dấu **—** kèm chữ *"sẽ ghi 0"* và số dự kiến làm tham chiếu (= tồn đã duyệt hôm qua + phiếu đã duyệt). Muốn lấy nguyên số hôm qua thì bấm **Giữ nguyên**, không phải cứ bỏ trống. Phi có thép nhập/chuyển từ lần chốt trước **không được "giữ nguyên"**, bắt buộc đếm thực tế.
- Nếu một phiếu được duyệt **sau khi** số của khu đã duyệt, số dự kiến của khu đổi mà số đã duyệt thì không: màn Duyệt nhắc *xem lại khu đó*. Duyệt lại khu là hết nhắc. Khi 2 người báo khác số, admin xem **hai số cạnh nhau** và chọn từng phi — chọn số xong vẫn phải bấm Duyệt khu, vì chọn số không phải là duyệt số.
- Không ẩn được khu còn thép (phải chuyển đi hoặc đếm về 0 trước).
- **Xem lại ngày cũ**, **báo cáo Nhập – Dùng – Tồn theo kỳ** (xuất CSV, có **cột Điều chỉnh** riêng khi kỳ đó có sửa sổ), và **dự báo số ngày còn đủ dùng** từng phi (theo lượng dùng trung bình 28 ngày). Kỳ nào có phiếu xuất thì bảng thêm **cột "Có phiếu"** — phần lượng dùng đã giải thích được.
- Nhật ký hoạt động và lịch sử đếm chỉ ghi thêm (database từ chối sửa/xóa).

Vai trò: **Admin** (tất cả), **Thủ kho** (đếm + nhập kho), **Người đếm** (đếm + xem).

### Tài khoản và tên người làm

- **Tên đi theo mọi hoạt động.** Số đếm, phiếu, báo cáo khu và lần chốt ngày đều hiện tên người làm, nên khi tạo tài khoản hãy đặt **đúng họ tên**, đừng đặt theo chức danh — một tài khoản tên "admin" sẽ ghi "admin" lên mọi thứ và sau này không ai biết người thật là ai.
- **Sửa được tên** nếu đặt sai. Số đếm, phiếu, báo cáo khu và tên người duyệt hiện tên mới **ngay**, kể cả dữ liệu cũ. Riêng **nhật ký** thì các dòng trước khi đổi vẫn mang tên cũ: nhật ký lưu sẵn tên vào từng dòng và database từ chối mọi lệnh sửa, cố ý như vậy để nhật ký không viết lại được. Chính dòng *"đổi tên X thành Y"* trong nhật ký là cái nối hai tên lại.
- **Xoá tài khoản**: người đó không đăng nhập được nữa, bị đăng xuất khỏi mọi máy và bỏ khỏi phân công khu. **Mọi số đếm, phiếu và báo cáo họ đã làm vẫn giữ nguyên, vẫn mang tên họ** — nên hệ thống không xoá hẳn dòng tài khoản, chỉ đánh dấu đã xoá. Vì vậy cũng **khôi phục lại được** ngay trong app nếu xoá nhầm (khôi phục xong hãy đặt lại PIN cho họ).
- **Admin đầu tiên** (tài khoản tạo ở màn Thiết lập) là chủ hệ thống: chỉ người này **sửa tên, xoá và khôi phục** tài khoản. Ngược lại, chính tài khoản đó thì **không ai khóa, hạ quyền hay xoá được** — kể cả một admin khác — để cả bãi không bao giờ mất đường quản lý người dùng. Mọi admin đều tạo được tài khoản mới.
- Số điện thoại của tài khoản đã xoá vẫn bị giữ (mỗi số một tài khoản), nên muốn dùng lại số đó thì **khôi phục** tài khoản cũ thay vì tạo mới.

### Đếm nhiều lần mỗi ngày

Ở **Thêm → Cài đặt → Quy tắc → Mỗi khu phải đếm mấy lần/ngày**. Mặc định **1 lần**, tức như trước: báo một lần là đủ.

- **Giờ làm việc do admin đặt** ngay dưới đó (*Giờ làm từ … đến …*, mặc định 6h–18h). Chọn 2–4 lần thì giờ làm được chia đều thành các khung. Ví dụ giờ làm 6h–18h: 2 lần là *buổi sáng (6h–12h)* và *buổi chiều (12h–18h)*, 3 lần là 6h–10h, 10h–14h, 14h–18h. Chia không chẵn thì mốc có phút: giờ làm 7h–17h chia 3 lần là 7h–10h20, 10h20–13h40, 13h40–17h.
- Màn Cài đặt **xem trước khung giờ** ngay khi chọn, trước khi lưu. Giờ kết thúc phải sau giờ bắt đầu, và mỗi khung ít nhất 1 tiếng (giờ làm 3 tiếng thì không đếm được 4 lần); sai thì báo ngay và không lưu.
- Chia theo giờ làm chứ không chia 24 giờ, vì chia cả ngày thì khung đầu rơi vào nửa đêm và khu nào cũng bị báo thiếu. Đếm trước giờ bắt đầu thì tính vào khung đầu, sau giờ kết thúc thì tính vào khung cuối.
- Đổi giờ làm giữa ngày thì các lần đã đếm hôm đó được **xếp lại theo khung mới**, không mất lần nào.
- **Đây là quy định bắt buộc, không chỉ là lời nhắc.** Khung **đã kết thúc** mà khu chưa đếm thì:
  - Tổng quan hiện thẻ đỏ, thẻ khu đổi nhãn thành *"Thiếu lần đếm"*;
  - màn Duyệt tính là **việc chưa xử lý**, nên muốn chốt ngày phải **ghi lý do**;
  - đêm đó **không tự chốt**, nhật ký ghi rõ khu nào thiếu khung nào.
- **Lần đếm khung sau không bù cho khung trước.** Mục đích của việc đếm nhiều lần là có số ở từng buổi; cho bù thì ai cũng đếm một lần buổi chiều cho xong. Nên quên buổi sáng thì cách gỡ duy nhất là admin ghi lý do lúc chốt.
- Khung **đang diễn ra** chưa tính là thiếu. Khu **trống** (không có thép, không có phiếu) không bị đòi. Khu chưa báo lần nào thì đã có nhắc *"chưa báo"*, không bị nhắc thêm lần nữa.
- **Mỗi lần khu báo lại phải được duyệt lại**: đếm 2 lần/ngày là admin duyệt mỗi khu 2 lần.
- Khung giờ tính theo **giờ Việt Nam của máy chủ**, không theo đồng hồ điện thoại, nên máy để sai giờ cũng không nhắc sai.
- Báo cáo lưu lúc mất mạng rồi tự gửi lại thì khung tính theo **lúc đếm**, không theo lúc có mạng. Gửi muộn quá 15 phút thì màn Duyệt hiện cả hai giờ (*"đếm lúc 11:30, tới máy chủ lúc 13:00"*) để người duyệt soi.
- Lần admin **chọn số** khi hai người báo khác nhau và mốc **đặt tồn về 0** không được tính là một lần đếm.

### Vay mượn ngoài bãi

Ở **Thêm → Vay mượn ngoài bãi**. Sổ ghi **công nợ thép với đối tác bên ngoài**: ai đang giữ thép của ai, bao nhiêu, phi nào.

- **Không cộng trừ vào tồn bãi.** Thép qua cổng thật vẫn phải lập phiếu **Nhập thép về** hoặc **Xuất kho** như thường để tồn đúng. Sổ này chỉ trả lời *"ai đang nợ ai"*, không trả lời *"bãi còn bao nhiêu thép"*.
- Bốn loại ghi, tính thành **hai cặp riêng**: *Mình vay* / *Mình trả* là **mình nợ đối tác**; *Cho họ vay* / *Họ trả* là **đối tác nợ mình**. Cùng một đối tác có thể vừa cho mình vay D16 vừa đang mượn của mình D18.
- **Ai cũng ghi được** (cả người đếm), vì người thấy xe thép thường là người ngoài bãi. Một lần ghi được nhiều phi.
- **Admin duyệt** từng lần ghi; chưa duyệt thì chưa vào dư nợ. Tổng quan nhắc admin khi có lần ghi chờ duyệt.
- Hoàn tác như phiếu: người ghi **rút lại** khi chưa duyệt, hoặc **huỷ** trong 10 phút sau khi duyệt; sau đó nhờ admin.
- Ghi *trả* nhiều hơn số đang nợ thì app **nhắc** (có thể một lần vay cũ chưa ai ghi) nhưng không chặn.
- **Đối tác**: ai cũng thêm được tên mới; admin và thủ kho sửa tên hoặc ẩn. Đối tác đã ẩn không ghi thêm được, nhưng dư nợ và lịch sử vẫn giữ.
- Mọi lần ghi, duyệt, huỷ nằm trong **nhật ký**, có chip lọc *Vay mượn* riêng.
- **Xoá sạch dữ liệu thép không xoá sổ vay**: đây là công nợ với bên ngoài, không phải số liệu của bãi. Bản sao toàn bộ có chứa sổ vay; nạp lại một bản sao **cũ chưa có sổ vay** thì sổ vay hiện tại được **giữ nguyên**.

### Điều chỉnh tồn

Ở **Nhập → Điều chỉnh**. Dùng khi **sổ sai** mà không phiếu nào giải thích được: kỳ trước đếm sai, ghi nhầm phiếu, hoặc hụt thép không rõ nguyên nhân. Thủ kho và admin **lập** được, chỉ admin **duyệt**.

- **Đây không phải phiếu xuất.** Thép thật đi hay về thì dùng **Nhập thép về** / **Chuyển khu**; thép rời bãi đi công trình thì ghi **[Phiếu xuất](#phiếu-xuất-tuỳ-chọn)** (hoặc cứ để khu đếm xuống, hệ thống tự tính ra "đã dùng"). Chỉ dùng Điều chỉnh khi con số trong máy **sai** so với thực tế ngoài bãi. Khác nhau ở chỗ: điều chỉnh **sửa sổ** nên nó *không* tính vào lượng dùng, còn phiếu xuất là thép **đi thật** nên nó *nằm trong* lượng dùng.
- Chọn **khu**, chọn **tăng hay giảm**, chọn **phi**, gõ số **luôn dương** (chiều do nút quyết định, không phải gõ dấu trừ), rồi chọn **lý do** — bốn lựa chọn sẵn, "Lý do khác" thì bắt ghi rõ. Lý do nằm trong phiếu và trong **nhật ký mãi mãi**.
- Màn hình nói luôn **"đang có X → còn Y"** ngay khi gõ, và báo đỏ nếu giảm quá số khu đang thực có.
- **Không giảm quá số khu đang thực có.** Chặn cả lúc lập và lúc duyệt, vì lúc lập còn đủ không có nghĩa lúc duyệt còn đủ. Nhiều phiếu giảm đang chờ duyệt cũng không cùng rút một lô thép được: phiếu chờ duyệt đã giữ phần thép đó, nên tồn khu không bao giờ âm.
- Điều chỉnh **quá 20 tấn** phải gõ đúng `DONG Y` mới lưu được. Mốc này cố ý để cao: một bó D16 đã là 3,3 tấn, nếu chặn từ vài tấn thì gần như lần sửa sổ nào cũng bị đòi gõ tay — cổng nào cũng kêu thì người dùng gõ cho xong và cổng hết tác dụng.
- Duyệt xong, phi đó **không "giữ nguyên" được nữa**: khu buộc phải ra đếm thật để xác minh con số vừa sửa.
- **Lượng dùng không bị ảnh hưởng.** Sửa sổ giảm 300 cây rồi khu đếm lại thấy đúng số mới thì "đã dùng" ra **0**, không phải 300. Đây là lý do tính năng này làm bằng một phiếu chứ không phải sửa thẳng số đếm: sửa thẳng số đếm thì phần chênh thành một cú "đã dùng" khổng lồ, nó vào mức dùng trung bình và kéo cảnh báo *"dùng nhiều bất thường"* sai suốt 28 ngày sau — đúng cái bẫy mà mục **Đặt tồn về 0** cũng phải tránh.
- **Không trộn vào cột Nhập.** Báo cáo theo kỳ có **cột Điều chỉnh riêng** (cả trong app lẫn trong CSV), nên mỗi kỳ đọc được ngay "tháng này sổ bị sửa bao nhiêu tấn". Gộp vào Nhập là biến tính năng này thành chỗ giấu chênh lệch. Đẳng thức vẫn khép kín: **Tồn đầu + Nhập + Điều chỉnh − Dùng = Tồn cuối**.
- Nhật ký có **chip lọc "Điều chỉnh"** riêng, không nằm trong nhóm "Nhập kho".
- Hoàn tác như mọi phiếu: người lập **rút lại** khi chưa duyệt, admin **từ chối** phiếu chờ hoặc **huỷ** phiếu đã duyệt cho tới khi ngày duyệt bị chốt.

### Phiếu xuất (tuỳ chọn)

Ở **Nhập → Xuất kho**. Thủ kho và admin **lập** được, chỉ admin **duyệt**.

**Ghi phiếu xuất là tuỳ bạn.** Không ghi thì app chạy y như trước: lượng dùng vẫn suy ra từ *tồn cũ + nhập − đếm*. Phiếu xuất không thay phép tính đó, nó chỉ **giải thích** được bao nhiêu phần trong đó. Ghi được bao nhiêu thì phần **"không rõ"** co lại bấy nhiêu — và chính phần không rõ mới là con số đáng đi hỏi.

- Bắt buộc ghi **xuất cho ai / công trình nào**. Phiếu xuất không nói thép đi đâu thì không thêm được gì so với con số app đã tự suy ra, nên app từ chối.
- **Không xuất quá số khu đang thực có.** Chặn cả lúc lập và lúc duyệt, dùng chung chốt chặn với Chuyển khu và Điều chỉnh: phiếu đang chờ duyệt đã giữ phần thép đó, nên hai phiếu xuất không cùng rút một lô thép được.
- **Phải admin duyệt** mới trừ vào tồn. Lý do không phải hình thức: một phiếu xuất làm số **dự kiến** của khu tụt xuống, tức nó đổi chính cái thước mà admin dùng để soi khu đó. Nếu tự ghi phiếu xuất là tự hạ thước thì ghi phiếu xuất thành cách xoá dấu vết hụt thép.
- Màn **Duyệt** tách con số ra: *"đã dùng 1.300 — trong đó 1.100 có phiếu xuất, 200 không rõ đi đâu"*.
- **Lượng dùng vẫn là TỔNG.** Xuất 1.100 có phiếu mà khu đếm hụt 1.300 thì "đã dùng" là **1.300**, không phải 200. Đây là chỗ dễ sai nhất: nếu để phần xuất nằm trong vế "Nhập" thì nó tự triệt tiêu với phần khu đếm hụt, "đã dùng" tụt còn đúng phần không có phiếu, mức dùng trung bình thấp hơn thực tế, rồi dự báo *"còn đủ dùng bao nhiêu ngày"* nói dư ra — **càng ghi phiếu đầy đủ thì dự báo càng sai**, đúng chiều ngược với mục đích.
- Báo cáo kỳ có **cột "Có phiếu"** riêng (app) và cột **"Có phiếu xuất"** trong CSV. Cột này **nằm trong** cột Dùng, không cộng thêm, nên đẳng thức vẫn khép kín: **Tồn đầu + Nhập − Dùng = Tồn cuối**.
- Nhật ký ghi **nơi đến** của từng phiếu, nên tra lại được "tháng này xuất cho công trình nào bao nhiêu".
- Hoàn tác như mọi phiếu: người lập **rút lại** khi chưa duyệt, admin **từ chối** phiếu chờ hoặc **huỷ** phiếu đã duyệt cho tới khi ngày duyệt bị chốt.

### Mở lại ngày đã chốt

Ở màn **Xem lại ngày cũ** (Thêm → Xem lại ngày cũ), chọn ngày rồi bấm **Mở lại ngày …**. Ngày hôm nay cũng mở lại được ngay ở màn **Duyệt**. Bắt buộc ghi **lý do**, và lý do nằm trong nhật ký.

- **Chỉ mở lại được lần chốt gần nhất.** Tồn chuẩn của một ngày là điểm xuất phát của **mọi ngày sau nó**. Mở một ngày ở giữa thì các lần chốt sau đó vẫn giữ con số tính từ mốc cũ, và từ đó trở đi không ngày nào còn khớp với ngày trước nó — sai mà không chỗ nào báo. Mở lần chốt gần nhất thì sau nó chưa có gì phái sinh, app chỉ quay về đúng trạng thái *"chưa chốt"* mà nó vốn đã biết xử lý (kể cả khi bỏ quên nhiều ngày: gộp span).
- Ngày **đã qua** thì chỉ **admin đầu tiên** mở được (giống đặt lại số liệu), vì nó dời cái mốc cả bãi đang dựa vào. Ngày **hôm nay** thì admin nào cũng mở được — hôm nay chưa là mốc của ngày nào cả.
- Mở lại là **bỏ mốc chốt**, không phải xoá công đếm: **số đếm của các khu vẫn còn nguyên**. Chỉ tồn chuẩn và bảng tổng hợp của ngày đó bị bỏ, và phải chốt lại.
- Ngày đã chốt mà **không phải lần gần nhất** thì màn hình nói thẳng vì sao không mở được, kèm đường đi đúng.
- **Sổ đã chốt lâu rồi mà phát hiện sai thì đừng mở lại — hãy lập phiếu [Điều chỉnh tồn](#điều-chỉnh-tồn).** Đó là cách làm đúng của sổ sách: sửa con số **hiện tại** và để lại dấu vết, chứ không viết lại những ngày đã khóa. Mở lại chỉ dành cho trường hợp **vừa chốt nhầm**.

### Sao lưu toàn bộ

Ở **Thêm → Cài đặt → Dữ liệu thép**, chỉ **admin đầu tiên** thấy.

- **Tải bản sao toàn bộ (JSON)** — một tệp chứa tất cả: phi, khu, tài khoản, số đếm, phiếu, các ngày đã chốt, tồn chuẩn, cài đặt và nhật ký. Khác hai tệp CSV ở chỗ nó **nạp lại được**, nên đây mới là đường lùi thật. Nên tải định kỳ và cất ra ngoài máy chủ.
- **Nạp lại từ bản sao** — thay **sạch** số liệu hiện tại bằng số liệu trong tệp, không trộn. Phải chọn tệp, gõ `NAP LAI`, rồi còn một hộp xác nhận. Chỉ nạp được bản sao **cùng phiên bản cấu trúc**: nạp bản sao của cấu trúc cũ vào bảng đã đổi cột là hỏng kiểu không sửa được, nên hệ thống từ chối thẳng. Ngoại lệ duy nhất: bản sao cấu trúc 14 vẫn nạp được vào cấu trúc 15, vì bản 15 chỉ thêm bảng ghi lần đếm theo khung giờ (bảng đó để trống sau khi nạp).
- **Nhật ký không bị thay.** Database không cho xoá nhật ký, nên nạp lại chỉ có thể cộng thêm, tức nhân đôi lịch sử. Vì vậy nạp lại giữ nguyên nhật ký đang có và ghi thêm một dòng nói rõ vừa nạp từ bản sao nào.
- Tài khoản và PIN cũng nằm trong bản sao (PIN đã băm). Băm đó vô dụng nếu không có `PEPPER`, mà `PEPPER` chỉ nằm trên máy chủ chứ không nằm trong tệp. **Nhưng** ai được tạo sau ngày sao lưu sẽ mất tài khoản khi nạp lại.
- Cỡ bản sao: đo thực tế **60 ngày ≈ 2,7 MB**, suy ra khoảng **16 MB một năm**. Nhật ký và lịch sử đếm có trần 20.000 dòng gần nhất nên không phình vô hạn. Nếu bãi chạy nhiều năm thì nên xem lại chỗ này.

### Đặt lại số liệu thép

Hai việc khác nhau, nằm ở **Thêm → Cài đặt → Dữ liệu thép**, chỉ **admin đầu tiên** thấy:

- **Đặt tồn về 0 (kiểm kê lại)** — ghi một mốc *cả bãi = 0* cho hôm nay. Lịch sử và **báo cáo theo kỳ cũ vẫn xem được**; thống kê tính lại từ mốc này. Hôm nay thành **đã chốt**, từ mai đếm và nhập bình thường từ 0. Bấm nhầm thì vào **Duyệt → Mở lại ngày hôm nay**: tồn và các báo cáo của hôm nay trở lại **đúng như trước**. Hoàn tác được là vì lúc đặt lại hệ thống **chụp lại** số đếm và dấu "khu đã báo" của ngày đó; thiếu ảnh chụp thì hoàn tác chỉ còn cách lùi về tồn chuẩn cũ, mà ngày chưa có lần chốt nào trước đó thì không có tồn chuẩn nào để lùi và số liệu gốc mất hẳn. Lượng dùng của ngày đặt lại để **trống** chứ không ghi số: nếu ghi thì chênh lệch giữa tồn cũ và 0 thành một cú "đã dùng" khổng lồ, nó vào mức dùng trung bình và kéo cảnh báo "dùng nhiều bất thường" sai suốt 28 ngày sau.
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
Cuối lệnh có địa chỉ dạng `https://kho-thep.<ten-cua-ban>.workers.dev`. Đó là địa chỉ ứng dụng.

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
Mở `https://kho-thep.<ten-cua-ban>.workers.dev/setup`, nhập SETUP_TOKEN, tên, số điện thoại, PIN 4 số. Trang này chỉ dùng được một lần, có admin rồi hệ thống tự từ chối.

### 7. Thiết lập ban đầu trong ứng dụng
Đăng nhập admin, vào **Thêm**:
1. **Cài đặt**: đổi tên khu, thêm/ẩn khu theo bãi thực tế (mặc định có Khu A → H). Với từng phi, đặt **số cây mỗi bó**, **mức tồn tối thiểu** và **kg/cây** (mặc định theo 0,00617 × D² × 11,7 m, sửa theo trọng lượng thực tế nhà máy nếu khác).
2. **Người dùng và PIN**: tạo tài khoản cho thủ kho và các tổ. Hệ thống tạo PIN ngẫu nhiên hiện **một lần**, đưa cho người dùng. Họ phải tự đổi PIN khi đăng nhập lần đầu.
3. Ngày đầu tiên: các khu đếm và báo hết, admin vào **Duyệt**, duyệt từng khu rồi **Chốt ngày**. Số đã duyệt hôm đó trở thành tồn chuẩn đầu tiên, từ ngày sau hệ thống tính lượng dùng.

### 8. Cài lên điện thoại
- **Android (Chrome):** mở địa chỉ → menu ⋮ → **Thêm vào Màn hình chính** (hoặc **Cài đặt ứng dụng**).
- **iPhone (Safari):** mở địa chỉ → nút Chia sẻ → **Thêm vào Màn hình chính**.

---

## Việc thường làm

| Việc | Lệnh / cách làm |
|---|---|
| Cập nhật code sau khi sửa | Đẩy code lên GitHub (Cloudflare tự deploy), hoặc `npx wrangler deploy` |
| Nâng cấp cấu trúc database | **Tự động**: Worker tự áp dụng thay đổi ở lần chạy đầu sau deploy (số phiên bản lưu ở bảng `meta`, khóa `schema`). Không cần chạy lại `schema.sql` |
| Sao lưu dữ liệu ra file | `npx wrangler d1 export kho-thep --remote --output=backup.sql` |
| Khôi phục về thời điểm cũ | Cloudflare Dashboard → Storage & Databases → D1 → kho-thep → **Time Travel** (khôi phục theo từng phút, thời hạn lưu tùy gói, xem trang giá D1 của Cloudflare) |
| Xem lỗi trực tiếp | `npx wrangler tail` |
| Gắn tên miền riêng | Dashboard → Workers & Pages → kho-thep → Settings → **Domains & Routes** |
| Quên PIN | Admin vào **Người dùng và PIN → Đặt lại PIN** |
| Mất điện thoại | Admin **Khóa** tài khoản hoặc **Đăng xuất máy**, thiết bị bị đăng xuất ngay |
| Người nghỉ việc | Admin đầu tiên vào **Người dùng → Xoá tài khoản**. Hoạt động cũ vẫn giữ nguyên tên họ |
| Đặt sai tên tài khoản | Admin đầu tiên vào **Người dùng → Sửa tên**. Số đếm và phiếu cũ hiện tên mới ngay |
| Chạy thử xong, muốn dùng thật | Admin đầu tiên vào **Cài đặt → Dữ liệu thép → Xoá sạch**. Tải bản sao CSV trước |
| Kiểm kê lại cả bãi | **Cài đặt → Dữ liệu thép → Đặt tồn về 0**. Lịch sử cũ vẫn giữ, hoàn tác được |
| Vừa chốt nhầm | **Xem lại ngày cũ** → chọn ngày → **Mở lại ngày**. Chỉ được lần chốt gần nhất |
| Sổ ngày cũ sai, không mở lại được | **Nhập → Điều chỉnh**: sửa số hiện tại, để lại dấu vết. Không viết lại ngày đã khóa |
| Sổ sai một phi ở một khu | **Nhập → Điều chỉnh**, chọn tăng/giảm và lý do, rồi admin duyệt. Không ảnh hưởng lượng dùng |
| Xuất thép đi công trình | **Nhập → Xuất kho** (tuỳ chọn), ghi rõ nơi đến, rồi admin duyệt. Không ghi cũng được — app vẫn tính lượng dùng |
| Vay / cho đối tác vay thép | **Thêm → Vay mượn ngoài bãi**, admin duyệt. Không cộng trừ vào tồn, thép qua cổng vẫn lập phiếu Nhập/Xuất |

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
| D1 truy vấn mỗi yêu cầu | 50 | Tối đa khoảng 15 (gửi báo cáo cả khu chỉ 12, ghi hàng loạt bằng một câu lệnh `json_each`) |
| Cron | 5 | 1 (23:50 tự chốt + dọn dẹp) |
| D1 đọc | 5 triệu dòng/ngày | Dưới 1 triệu |
| D1 ghi | 100.000 dòng/ngày | Vài trăm đến vài nghìn |
| D1 dung lượng | 500 MB mỗi database | Khoảng 40 MB/năm |
| Giao diện tĩnh | Không giới hạn | |

Nếu Cloudflare chặn do hết hạn mức trong ngày, app vẫn mở được và hiện số liệu lần tải gần nhất, báo cáo đếm được giữ lại để gửi sau. Nếu sau này thường xuyên vượt hạn mức, gói Workers Paid 5 USD/tháng gỡ các giới hạn này, không cần sửa code.

## Bảo mật đã có
- PIN băm kèm PEPPER, không lưu PIN thật. Sai 5 lần khóa 15 phút, tái phạm khóa 1 giờ rồi 24 giờ. Một thiết bị (IP) sai quá 30 lần/ngày bị chặn đến hôm sau. Cookie `HttpOnly`, `Secure`, `SameSite=Strict`.
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
src/worker.js        điểm vào: định tuyến /api/* và Cron 23:50
src/core.js          tiện ích, giờ Việt Nam, hằng số, phi mặc định
src/db.js            tự nâng cấp database (migration, SCHEMA_VERSION)
src/helpers.js       hàm dùng chung: đọc request, CSV, nhật ký, phiên, cài đặt
src/slots.js         khung giờ đếm (đếm nhiều lần/ngày)
src/auth.js          đăng nhập, PIN, thiết lập
src/bootstrap.js     dữ liệu chung cho máy khách
src/counts.js        báo cáo đếm, hai người báo khác số, nhật ký, tệp CSV ngày
src/phieu.js         nhập, chuyển, xuất, điều chỉnh tồn
src/loans.js         sổ vay mượn ngoài bãi
src/review.js        màn Duyệt, chốt / mở lại ngày, tự chốt
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
- *Giao diện không cập nhật sau khi deploy*: đóng hẳn app rồi mở lại (service worker lấy bản mới từ mạng). Khi sửa giao diện, tăng số `CACHE` trong `public/sw.js`.
