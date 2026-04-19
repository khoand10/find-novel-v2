Hiểu đơn giản như sau:

scheduler là đồng hồ báo thức.
queue là hàng chờ công việc.
service là người đi làm việc crawl thật.
Luồng chạy

App bật lên -> scheduler được khởi động.
Đến giờ cron:
10 phút/lần: báo thức latest-release
30 phút/lần: báo thức main-sync
0h mỗi ngày: báo thức daily-maintenance
(tuỳ bật) fix-chapter
Mỗi báo thức không crawl trực tiếp, chỉ “ném việc” vào schedulerQueue.
schedulerQueue lấy từng việc ra chạy (1 việc một lúc), rồi gọi đúng hàm crawl tương ứng.
Các việc chính trong schedulerQueue

latest-release: kiểm tra list truyện/chapter mới nhất và cập nhật phần thiếu.
main-sync: quét truyện đang có + tìm truyện mới; có thể kèm fixChapter.
maintenance-daily: cập nhật view day/week/month + gán cờ hot/new.
fix-chapter: dọn/chữa dữ liệu chapter gần đây nếu nghi lỗi.
Điểm an toàn

Có chống trùng job bằng key (đang chạy rồi thì không nhét thêm job cùng loại).
Có retry cho job scheduler nếu lỗi tạm thời.
Có gửi Telegram khi lỗi queue (và khi thêm chapter mới thành công ở chapterQueue).
Tóm gọn: scheduler chỉ hẹn giờ, queue điều phối và chống trùng, còn crawl thật nằm ở service