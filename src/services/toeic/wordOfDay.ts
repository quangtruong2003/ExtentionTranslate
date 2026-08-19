import { toDateKey } from "./stats.ts";

export interface ToeicWordOfDay {
  word: string;
  partOfSpeech: string;
  definition: string;
  example: string;
  translationVi: string;
  translationZh: string;
}

/**
 * Curated high-frequency TOEIC vocabulary. The daily pick rotates through the
 * list deterministically by date, so every user sees the same word on the same
 * day and the word is stable across reloads.
 */
export const TOEIC_WORD_LIST: ToeicWordOfDay[] = [
  { word: "agenda", partOfSpeech: "noun", definition: "A list of items to be discussed at a meeting.", example: "The agenda for tomorrow's meeting was sent by email.", translationVi: "chương trình nghị sự", translationZh: "议程" },
  { word: "allocate", partOfSpeech: "verb", definition: "To distribute resources or duties for a particular purpose.", example: "The manager will allocate the budget to each department.", translationVi: "phân bổ", translationZh: "分配" },
  { word: "deadline", partOfSpeech: "noun", definition: "The latest time by which something must be completed.", example: "The deadline for the report is Friday at noon.", translationVi: "hạn chót", translationZh: "截止日期" },
  { word: "invoice", partOfSpeech: "noun", definition: "A document requesting payment for goods or services.", example: "Please pay the invoice within 30 days.", translationVi: "hóa đơn", translationZh: "发票" },
  { word: "negotiate", partOfSpeech: "verb", definition: "To discuss something in order to reach an agreement.", example: "The two companies negotiated a new contract.", translationVi: "đàm phán", translationZh: "谈判" },
  { word: "shipment", partOfSpeech: "noun", definition: "Goods transported together, or the act of sending them.", example: "The shipment will arrive at the warehouse on Monday.", translationVi: "lô hàng", translationZh: "货运" },
  { word: "comply", partOfSpeech: "verb", definition: "To act in accordance with a rule or request.", example: "All employees must comply with the safety regulations.", translationVi: "tuân thủ", translationZh: "遵守" },
  { word: "eligible", partOfSpeech: "adjective", definition: "Having the right to do or receive something.", example: "Employees are eligible for a bonus after one year.", translationVi: "đủ điều kiện", translationZh: "有资格的" },
  { word: "implement", partOfSpeech: "verb", definition: "To put a plan or decision into effect.", example: "The company will implement the new policy next month.", translationVi: "thực hiện, triển khai", translationZh: "实施" },
  { word: "mandatory", partOfSpeech: "adjective", definition: "Required by law or rules; compulsory.", example: "Attendance at the training session is mandatory.", translationVi: "bắt buộc", translationZh: "强制的" },
  { word: "objective", partOfSpeech: "noun", definition: "A goal or aim that someone tries to achieve.", example: "Our main objective is to increase customer satisfaction.", translationVi: "mục tiêu", translationZh: "目标" },
  { word: "personnel", partOfSpeech: "noun", definition: "The people employed in an organization.", example: "The personnel department handles all hiring decisions.", translationVi: "nhân sự", translationZh: "员工" },
  { word: "quarterly", partOfSpeech: "adjective / adverb", definition: "Happening four times a year.", example: "The board reviews the quarterly financial report.", translationVi: "hàng quý", translationZh: "每季度的" },
  { word: "reimburse", partOfSpeech: "verb", definition: "To pay back money that someone has spent.", example: "The company will reimburse your travel expenses.", translationVi: "hoàn trả", translationZh: "报销" },
  { word: "schedule", partOfSpeech: "noun / verb", definition: "A plan of events or times; to arrange for a time.", example: "The meeting was scheduled for 9 a.m.", translationVi: "lịch trình; lên lịch", translationZh: "日程；安排" },
  { word: "terminate", partOfSpeech: "verb", definition: "To bring something to an end.", example: "The contract will terminate at the end of the year.", translationVi: "chấm dứt", translationZh: "终止" },
  { word: "vacancy", partOfSpeech: "noun", definition: "An unoccupied position or room available for use.", example: "There is a vacancy in the marketing department.", translationVi: "vị trí trống", translationZh: "空缺" },
  { word: "warranty", partOfSpeech: "noun", definition: "A written promise to repair or replace a product.", example: "The laptop comes with a two-year warranty.", translationVi: "bảo hành", translationZh: "保修" },
  { word: "acknowledge", partOfSpeech: "verb", definition: "To confirm that something has been received or is true.", example: "Please acknowledge receipt of this email.", translationVi: "xác nhận", translationZh: "确认" },
  { word: "benefit", partOfSpeech: "noun / verb", definition: "An advantage or profit; to gain an advantage.", example: "Health insurance is one of the company's benefits.", translationVi: "quyền lợi; hưởng lợi", translationZh: "福利；受益" },
  { word: "candidate", partOfSpeech: "noun", definition: "A person who applies for a job or position.", example: "Three candidates were interviewed for the position.", translationVi: "ứng viên", translationZh: "候选人" },
  { word: "distribute", partOfSpeech: "verb", definition: "To give something to several people or places.", example: "The flyers will be distributed at the entrance.", translationVi: "phân phát", translationZh: "分发" },
  { word: "estimate", partOfSpeech: "noun / verb", definition: "An approximate calculation; to calculate roughly.", example: "The contractor gave us an estimate for the repairs.", translationVi: "ước tính", translationZh: "估计" },
  { word: "facility", partOfSpeech: "noun", definition: "A building, place, or piece of equipment for a purpose.", example: "The new manufacturing facility opens in June.", translationVi: "cơ sở", translationZh: "设施" },
  { word: "guarantee", partOfSpeech: "noun / verb", definition: "A formal promise that something will happen or be true.", example: "We guarantee delivery within three business days.", translationVi: "bảo đảm", translationZh: "保证" },
  { word: "headquarters", partOfSpeech: "noun", definition: "The main office of an organization.", example: "The company's headquarters is located in Chicago.", translationVi: "trụ sở chính", translationZh: "总部" },
  { word: "inventory", partOfSpeech: "noun", definition: "A complete list of items; the goods a business holds.", example: "We need to check our inventory before ordering more.", translationVi: "hàng tồn kho", translationZh: "库存" },
  { word: "justify", partOfSpeech: "verb", definition: "To show that something is reasonable or necessary.", example: "The results justify the additional expense.", translationVi: "biện minh", translationZh: "证明…合理" },
  { word: "keen", partOfSpeech: "adjective", definition: "Very interested or eager.", example: "She is keen to learn new software skills.", translationVi: "hăng hái, say mê", translationZh: "热切的" },
  { word: "liaison", partOfSpeech: "noun", definition: "Communication or cooperation between groups.", example: "He acts as a liaison between the two departments.", translationVi: "sự liên lạc", translationZh: "联络" },
  { word: "merger", partOfSpeech: "noun", definition: "The combining of two companies into one.", example: "The merger was completed after months of negotiation.", translationVi: "sự sáp nhập", translationZh: "合并" },
  { word: "notify", partOfSpeech: "verb", definition: "To inform someone officially.", example: "Customers will be notified of any schedule changes.", translationVi: "thông báo", translationZh: "通知" },
  { word: "outstanding", partOfSpeech: "adjective", definition: "Excellent; or not yet paid or resolved.", example: "She received an award for outstanding performance.", translationVi: "xuất sắc; chưa thanh toán", translationZh: "杰出的；未付的" },
  { word: "proposal", partOfSpeech: "noun", definition: "A formal plan or suggestion put forward for consideration.", example: "The committee approved the budget proposal.", translationVi: "đề xuất", translationZh: "提案" },
  { word: "quota", partOfSpeech: "noun", definition: "A fixed share or amount that is allowed or required.", example: "The sales team exceeded its monthly quota.", translationVi: "chỉ tiêu", translationZh: "配额" },
  { word: "recruit", partOfSpeech: "verb / noun", definition: "To hire new people; a newly hired person.", example: "We plan to recruit ten new engineers this year.", translationVi: "tuyển dụng", translationZh: "招募" },
  { word: "subordinate", partOfSpeech: "noun / adjective", definition: "A person lower in rank; less important.", example: "Managers should support their subordinates.", translationVi: "cấp dưới", translationZh: "下属" },
  { word: "turnover", partOfSpeech: "noun", definition: "The rate at which employees leave; total sales revenue.", example: "High staff turnover increases training costs.", translationVi: "tỷ lệ nghỉ việc; doanh thu", translationZh: "人员流动率；营业额" },
  { word: "upgrade", partOfSpeech: "verb / noun", definition: "To raise to a higher standard; an improvement.", example: "The hotel upgraded our room to a suite.", translationVi: "nâng cấp", translationZh: "升级" },
  { word: "vendor", partOfSpeech: "noun", definition: "A person or company that sells something.", example: "The software vendor released a security update.", translationVi: "nhà cung cấp", translationZh: "供应商" },
  { word: "withdraw", partOfSpeech: "verb", definition: "To remove or take back something.", example: "She decided to withdraw her application.", translationVi: "rút lại", translationZh: "撤回" },
  { word: "yield", partOfSpeech: "verb / noun", definition: "To produce or give way; the amount produced.", example: "The investment yielded a high return.", translationVi: "mang lại; nhường", translationZh: "产生；屈服" },
  { word: "adjourn", partOfSpeech: "verb", definition: "To pause or end a meeting until a later time.", example: "The chairperson adjourned the meeting at 5 p.m.", translationVi: "hoãn", translationZh: "休会" },
  { word: "bid", partOfSpeech: "noun / verb", definition: "An offer of a price; to offer a price.", example: "Three firms submitted bids for the construction project.", translationVi: "đấu thầu", translationZh: "投标" },
  { word: "consensus", partOfSpeech: "noun", definition: "A general agreement among a group.", example: "The team reached a consensus on the design.", translationVi: "sự đồng thuận", translationZh: "共识" },
  { word: "deficit", partOfSpeech: "noun", definition: "The amount by which something is too small.", example: "The budget deficit grew this quarter.", translationVi: "thâm hụt", translationZh: "赤字" },
  { word: "expedite", partOfSpeech: "verb", definition: "To make something happen faster.", example: "We will expedite your order at no extra cost.", translationVi: "xúc tiến", translationZh: "加快" },
  { word: "feasible", partOfSpeech: "adjective", definition: "Possible and practical to do easily.", example: "The plan is not feasible within the current budget.", translationVi: "khả thi", translationZh: "可行的" },
  { word: "gratuity", partOfSpeech: "noun", definition: "A tip given for service.", example: "A 15% gratuity is added to bills for large groups.", translationVi: "tiền boa", translationZh: "小费" },
  { word: "hazard", partOfSpeech: "noun", definition: "A danger or risk.", example: "Wet floors are a safety hazard in the factory.", translationVi: "mối nguy hiểm", translationZh: "危险" },
  { word: "incentive", partOfSpeech: "noun", definition: "Something that encourages a person to do something.", example: "The bonus is an incentive for meeting targets.", translationVi: "khuyến khích, đãi ngộ", translationZh: "激励" },
  { word: "jeopardize", partOfSpeech: "verb", definition: "To put something at risk of being lost or harmed.", example: "Late delivery could jeopardize the contract.", translationVi: "gây nguy hại", translationZh: "危及" },
  { word: "legitimate", partOfSpeech: "adjective", definition: "Allowed by law; reasonable and acceptable.", example: "The company has a legitimate reason to request ID.", translationVi: "hợp pháp", translationZh: "合法的" },
  { word: "milestone", partOfSpeech: "noun", definition: "An important event or stage in progress.", example: "Reaching one million users was a major milestone.", translationVi: "cột mốc", translationZh: "里程碑" },
  { word: "nominate", partOfSpeech: "verb", definition: "To propose someone for a position or award.", example: "She was nominated for employee of the year.", translationVi: "đề cử", translationZh: "提名" },
  { word: "overdue", partOfSpeech: "adjective", definition: "Not having happened or been done by the expected time.", example: "The payment is two weeks overdue.", translationVi: "quá hạn", translationZh: "逾期的" },
  { word: "procurement", partOfSpeech: "noun", definition: "The process of obtaining goods or services.", example: "The procurement department handles all purchases.", translationVi: "mua sắm, thu mua", translationZh: "采购" },
  { word: "remuneration", partOfSpeech: "noun", definition: "Payment or compensation for work.", example: "The remuneration package includes a pension plan.", translationVi: "thù lao", translationZh: "报酬" },
  { word: "stipulate", partOfSpeech: "verb", definition: "To demand something as part of an agreement.", example: "The contract stipulates a 90-day notice period.", translationVi: "quy định", translationZh: "规定" },
  { word: "tentative", partOfSpeech: "adjective", definition: "Not certain or fixed; provisional.", example: "We set a tentative date for the launch.", translationVi: "dự kiến, tạm thời", translationZh: "暂定的" },
];

/** Deterministic daily pick: same word for everyone on the same local date. */
export function pickWordOfDay(dateKey: string, list: ToeicWordOfDay[] = TOEIC_WORD_LIST): ToeicWordOfDay | null {
  if (list.length === 0) return null;
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const dayIndex = Math.floor(parsed.getTime() / 86_400_000);
  const index = ((dayIndex % list.length) + list.length) % list.length;
  return list[index] ?? null;
}

export function getTodayWord(now: Date = new Date()): ToeicWordOfDay | null {
  return pickWordOfDay(toDateKey(now));
}
