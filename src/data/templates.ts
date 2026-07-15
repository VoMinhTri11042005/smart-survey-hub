import type { SurveyQuestion } from '../types';

export interface SurveyTemplate {
  id: string;
  title: string;
  description: string;
  category: string;
  icon: string;
  questions: SurveyQuestion[];
}

export const SURVEY_TEMPLATES: SurveyTemplate[] = [
  {
    id: 'customer-satisfaction',
    title: 'Khảo sát hài lòng khách hàng',
    description: 'Đo lường mức độ hài lòng và trải nghiệm dịch vụ của khách hàng.',
    category: 'Khách hàng',
    icon: '⭐',
    questions: [
      { id: 'q1', type: 'star_rating', text: 'Bạn đánh giá tổng thể dịch vụ của chúng tôi như thế nào?', required: true },
      { id: 'q2', type: 'single_choice', text: 'Bạn sử dụng sản phẩm/dịch vụ của chúng tôi bao lâu rồi?', options: ['Dưới 1 tháng', '1-6 tháng', '6-12 tháng', 'Trên 1 năm'], required: true },
      { id: 'q3', type: 'multiple_choice', text: 'Điều gì bạn thích nhất?', options: ['Chất lượng sản phẩm', 'Giá cả hợp lý', 'Hỗ trợ khách hàng', 'Giao hàng nhanh', 'Giao diện dễ dùng'], required: false },
      { id: 'q4', type: 'nps', text: 'Bạn có khả năng giới thiệu chúng tôi cho bạn bè không?', required: true },
      { id: 'q5', type: 'text', text: 'Bạn có góp ý hoặc đề xuất nào không?', required: false },
    ],
  },
  {
    id: 'employee-engagement',
    title: 'Khảo sát gắn kết nhân viên',
    description: 'Đánh giá mức độ hài lòng và động lực làm việc của nhân viên.',
    category: 'Nhân sự',
    icon: '👥',
    questions: [
      { id: 'q1', type: 'star_rating', text: 'Bạn hài lòng với môi trường làm việc hiện tại?', required: true },
      { id: 'q2', type: 'single_choice', text: 'Bạn cảm thấy công việc có ý nghĩa?', options: ['Rất đồng ý', 'Đồng ý', 'Trung lập', 'Không đồng ý', 'Hoàn toàn không đồng ý'], required: true },
      { id: 'q3', type: 'single_choice', text: 'Mức độ hỗ trợ từ quản lý trực tiếp?', options: ['Xuất sắc', 'Tốt', 'Trung bình', 'Kém', 'Rất kém'], required: true },
      { id: 'q4', type: 'multiple_choice', text: 'Điều gì cần cải thiện?', options: ['Lương thưởng', 'Cơ hội thăng tiến', 'Work-life balance', 'Đào tạo', 'Văn hóa công ty'], required: false },
      { id: 'q5', type: 'text', text: 'Chia sẻ thêm ý kiến của bạn', required: false },
    ],
  },
  {
    id: 'event-feedback',
    title: 'Phản hồi sự kiện',
    description: 'Thu thập ý kiến sau hội thảo, workshop hoặc sự kiện.',
    category: 'Sự kiện',
    icon: '🎤',
    questions: [
      { id: 'q1', type: 'star_rating', text: 'Bạn đánh giá chất lượng nội dung sự kiện?', required: true },
      { id: 'q2', type: 'star_rating', text: 'Bạn đánh giá diễn giả/người thuyết trình?', required: true },
      { id: 'q3', type: 'single_choice', text: 'Sự kiện có đáp ứng kỳ vọng của bạn?', options: ['Vượt kỳ vọng', 'Đáp ứng', 'Trung bình', 'Chưa đáp ứng', 'Thất vọng'], required: true },
      { id: 'q4', type: 'single_choice', text: 'Bạn có muốn tham gia sự kiện tương tự?', options: ['Chắc chắn có', 'Có thể', 'Không chắc', 'Không'], required: true },
      { id: 'q5', type: 'text', text: 'Chủ đề bạn muốn thấy ở sự kiện tiếp theo?', required: false },
    ],
  },
  {
    id: 'product-research',
    title: 'Nghiên cứu sản phẩm',
    description: 'Hiểu nhu cầu người dùng để phát triển tính năng mới.',
    category: 'Sản phẩm',
    icon: '🔬',
    questions: [
      { id: 'q1', type: 'single_choice', text: 'Bạn sử dụng sản phẩm với mục đích gì?', options: ['Cá nhân', 'Công việc', 'Học tập', 'Khác'], required: true },
      { id: 'q2', type: 'multiple_choice', text: 'Tính năng bạn dùng nhiều nhất?', options: ['Báo cáo', 'Tích hợp API', 'Thông báo', 'Xuất dữ liệu', 'Cộng tác nhóm'], required: true },
      { id: 'q3', type: 'single_choice', text: 'Tần suất sử dụng?', options: ['Hàng ngày', 'Hàng tuần', 'Hàng tháng', 'Hiếm khi'], required: true },
      { id: 'q4', type: 'star_rating', text: 'Mức độ dễ sử dụng của sản phẩm?', required: true },
      { id: 'q5', type: 'text', text: 'Tính năng bạn muốn có thêm?', required: false },
    ],
  },
  {
    id: 'training-evaluation',
    title: 'Đánh giá khóa đào tạo',
    description: 'Đo lường hiệu quả chương trình đào tạo nội bộ.',
    category: 'Đào tạo',
    icon: '📚',
    questions: [
      { id: 'q1', type: 'star_rating', text: 'Chất lượng nội dung khóa học?', required: true },
      { id: 'q2', type: 'star_rating', text: 'Kỹ năng giảng viên?', required: true },
      { id: 'q3', type: 'single_choice', text: 'Tài liệu khóa học có hữu ích?', options: ['Rất hữu ích', 'Hữu ích', 'Trung bình', 'Ít hữu ích', 'Không hữu ích'], required: true },
      { id: 'q4', type: 'single_choice', text: 'Bạn có áp dụng được kiến thức vào công việc?', options: ['Ngay lập tức', 'Trong 1 tuần', 'Trong 1 tháng', 'Chưa áp dụng được'], required: true },
      { id: 'q5', type: 'text', text: 'Góp ý cải thiện khóa học', required: false },
    ],
  },
  {
    id: 'market-research',
    title: 'Nghiên cứu thị trường',
    description: 'Khảo sát xu hướng và nhu cầu thị trường mục tiêu.',
    category: 'Marketing',
    icon: '📊',
    questions: [
      { id: 'q1', type: 'single_choice', text: 'Độ tuổi của bạn?', options: ['18-24', '25-34', '35-44', '45-54', '55+'], required: true },
      { id: 'q2', type: 'single_choice', text: 'Thu nhập hàng tháng (ước tính)?', options: ['Dưới 10 triệu', '10-20 triệu', '20-40 triệu', 'Trên 40 triệu'], required: false },
      { id: 'q3', type: 'multiple_choice', text: 'Kênh bạn thường mua sắm?', options: ['Website', 'App di động', 'Cửa hàng', 'Mạng xã hội', 'Sàn thương mại điện tử'], required: true },
      { id: 'q4', type: 'nps', text: 'Bạn có quan tâm đến sản phẩm mới của chúng tôi?', required: true },
      { id: 'q5', type: 'text', text: 'Yếu tố quan trọng nhất khi quyết định mua?', required: false },
    ],
  },
];

export const TEMPLATE_CATEGORIES = ['Tất cả', ...Array.from(new Set(SURVEY_TEMPLATES.map(t => t.category)))];
