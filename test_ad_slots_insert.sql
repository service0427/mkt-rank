-- AD_SLOTS 테스트 데이터 (2일 기간)
-- 기존 ACTIVE 데이터 정리
UPDATE ad_slots SET is_active = 0 WHERE status = 'ACTIVE' AND is_active = 1;

-- 1. 키보드 루프 - 상품 MID만
INSERT INTO ad_slots (
    user_id, managed_id, work_keyword, 
    price_compare_mid, product_mid,
    status, start_date, end_date, duration_days, is_active
) VALUES (
    11, 11, '키보드 루프',
    NULL, '11213354899',
    'ACTIVE', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 2 DAY), 2, 1
);

-- 2. 키보드 루프 - 가격비교 + 상품 MID
INSERT INTO ad_slots (
    user_id, managed_id, work_keyword,
    price_compare_mid, product_mid,
    status, start_date, end_date, duration_days, is_active
) VALUES (
    11, 11, '키보드 루프',
    '46536728618', '5667946770',
    'ACTIVE', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 2 DAY), 2, 1
);

-- 3. 저소음키보드 - 가격비교 + 상품 MID  
INSERT INTO ad_slots (
    user_id, managed_id, work_keyword,
    price_compare_mid, product_mid,
    status, start_date, end_date, duration_days, is_active
) VALUES (
    11, 11, '저소음키보드',
    '53527631593', '9741860940',
    'ACTIVE', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 2 DAY), 2, 1
);

-- 확인
SELECT 
    ad_slot_id,
    work_keyword,
    price_compare_mid,
    product_mid,
    start_date,
    end_date,
    duration_days
FROM ad_slots
WHERE status = 'ACTIVE' AND is_active = 1;