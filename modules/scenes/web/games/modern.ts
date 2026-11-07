import type { World } from "../shared/worlds.ts";

export const MODERN_MESSAGES: Record<string, string> = {};
const t = (zh: string, en: string) => { MODERN_MESSAGES[zh] = en; return zh; };
const phase = (title: string, detail: string, enTitle: string, enDetail: string, stage: number) => ({ title: t(title, enTitle), detail: t(detail, enDetail), readings: [`${stage} / 3`, "—", "—"] as [string, string, string] });
const common = { challenge: true, unit: t("年", ""), unitLabel: t("探索距离", "Distance") };

export const MODERN_WORLDS = {
  flight: {
    ...common, id: "flight", path: "/chronicle/flight", time: 1903.9589, figure: "1903", title: t("飞行试验工坊", "The Flight Workshop"),
    readingLabels: [t("配平设置", "Trim settings"), t("完成航段", "Legs verified"), t("试飞次数", "Trials")],
    subtitle: t("木梁、蒙布与风。在离地之前，先学会让力量平衡。", "Timber, fabric and wind. Balance the forces before leaving the ground."),
    plate: "/media/art/epochs/combustion-flight-1600.webp", action: t("试飞", "Test flight"),
    phases: [
      phase("先看懂配平卡。", "观察双翼桁架，按卡上的重心与舵面刻度调整后试飞。", "Read the trim card.", "Inspect the braced biplane. Match the card's center-of-gravity and elevator settings before a trial.", 0),
      phase("完成第一段航程。", "成功不会替你调整下一段。查看新的配平卡，再移动配重和舵面。", "First leg complete.", "A successful trial does not set up the next leg. Read the new card and adjust ballast and elevator.", 1),
      phase("在反馈中寻找平衡。", "重心不对或机头过高、过低都会失败；保留已完成的航段，可以反复重试。", "Find balance through feedback.", "Incorrect ballast or excessive pitch fails the trial. Completed legs remain earned while you retry.", 2),
      phase("三段试飞通过。", "三张不同配平卡均已检验，模型完成本次飞行实验。", "Three legs verified.", "All three different trim cards have passed this model's flight experiment.", 3),
    ],
    note: t("以早期木骨蒙布飞机与风洞实验为灵感的交互模型。配平刻度与航段为教学设计，不是真实飞控或莱特飞机的性能复原。", "An interactive model inspired by early timber-and-fabric aircraft and wind-tunnel experiments. Trim marks and legs are educational abstractions, not flight controls or a performance reconstruction of the Wright Flyer."),
    source: "https://www.nps.gov/wrbr/learn/historyculture/thefirstflight.htm", next: "logic",
  },
  logic: {
    ...common, id: "logic", path: "/chronicle/logic", time: 1947, figure: "1947", title: t("逻辑电路工坊", "The Logic Laboratory"),
    readingLabels: [t("输入与预测", "Inputs and prediction"), t("已验真值行", "Rows verified"), t("当前目标", "Current target")],
    subtitle: t("两个输入，一个判断。把逻辑写进可以触摸的开关与导线。", "Two inputs, one decision. Put logic into switches and wires you can touch."),
    plate: "/media/art/epochs/transistor-computer-1600.webp", action: t("检验电路", "Test circuit"),
    phases: [
      phase("先预测，再通电。", "按照测试卡设置 A、B 与你预测的输出，按检验确认。", "Predict before testing.", "Set A, B and your predicted output to the test card, then run the check.", 0),
      phase("零与一开始组合。", "第一行通过。切换输入，不要把上一行的结果当作下一行答案。", "Bits begin to combine.", "The first row passed. Change the inputs instead of reusing the previous row's answer.", 1),
      phase("逐行验证 AND。", "两个输入都为一时，输出才为一。四行必须分别由你设置并检验。", "Verify AND row by row.", "The output is one only when both inputs are one. Set and test every row yourself.", 2),
      phase("完成整张真值表。", "四行全部通过，输入组合与预测输出均已逐一检验。", "Finish the truth table.", "All four rows passed. Every input combination and predicted output has been checked.", 3),
    ],
    note: t("1947 是点接触晶体管问世的时间入口；实验板将继电器、分立器件与逻辑教学组合为概念场景，不声称是当年某台计算机的复刻。", "1947 marks the first point-contact transistor. This conceptual laboratory combines relays, discrete components and logic education, rather than reconstructing a specific computer from that year."),
    source: "https://www.computerhistory.org/siliconengine/invention-of-the-point-contact-transistor/", next: "space",
  },
  space: {
    ...common, id: "space", path: "/chronicle/space", time: 1969.55, figure: "1969", title: t("轨道对接工坊", "The Orbital Docking Lab"),
    readingLabels: [t("对准读数", "Alignment"), t("剩余接近段", "Stages remaining"), t("完成检查点", "Checkpoints passed")],
    subtitle: t("在寂静的轨道上接近。每一次推进之前，先让位置与姿态对正。", "Approach in orbital silence. Align position and attitude before every advance."),
    plate: "/media/art/epochs/space-age-1600.webp", action: t("推进接近", "Advance approach"),
    phases: [
      phase("观察两个对接环。", "用平移与偏航控制把 X、Y、R 三个读数归零，再推进。", "Inspect both docking rings.", "Use translation and yaw controls to zero X, Y and R before advancing.", 0),
      phase("进入第二检查点。", "每段接近都有预设的小扰动，需要重新对正后才能继续。", "Enter the second checkpoint.", "A preset disturbance at each approach stage requires realignment before continuing.", 1),
      phase("完成最后对准。", "近距离检查环面与十字标记；位置或角度不对时对接会被拒绝。", "Make the final alignment.", "Inspect the ring faces and crosshairs closely. Docking is rejected if position or angle is wrong.", 2),
      phase("两舱完成软对接。", "三个检查点全部通过，舱体在对接环处接合。", "Soft docking complete.", "All three checkpoints passed and the modules meet at their docking rings.", 3),
    ],
    note: t("以阿波罗时代控制室与航天对接机构为灵感。位置、偏航与扰动均为离散教学模型，不模拟轨道动力学，也不提供真实航天器操作指导。", "Inspired by Apollo-era control rooms and spacecraft docking mechanisms. Position, yaw and disturbances form a discrete teaching model, not orbital dynamics or instructions for operating real spacecraft."),
    source: "https://www.nasa.gov/missions/apollo/apollo-11/apollo-11-mission-overview/", next: "network",
  },
  network: {
    ...common, id: "network", path: "/chronicle/network", time: 1991.5945, figure: "1991", title: t("网络分片工坊", "The Packet Workshop"),
    readingLabels: [t("当前分片", "Current fragment"), t("选定路径", "Selected route"), t("送达片数", "Fragments delivered")],
    subtitle: t("消息穿过夜色里的线路。绕开断路，把分散的片段重新连成一句话。", "Messages travel through the night. Route around broken links and reassemble the fragments."),
    plate: "/media/art/epochs/internet-v2-1600.webp", action: t("发送并重组", "Send and reassemble"),
    phases: [
      phase("先选择第一片。", "分片必须按一、二、三发送。节点图的红色线路表示当前分片无法通行。", "Select the first fragment.", "Send fragments one, two, three in order. Red links cannot carry the selected fragment.", 0),
      phase("绕开失效的线路。", "每片可用的路径不同。切换分片后，再观察节点图和路径指示。", "Route around a failed link.", "Each fragment has different available routes. Recheck the diagram after changing the fragment.", 1),
      phase("等待最后一个片段。", "错误次序不会覆盖接收端，断路也不会算作送达。选择正确分片与可用路径再试。", "Wait for the final fragment.", "Out-of-order fragments cannot overwrite the receiver, and broken routes do not count as delivery. Choose a valid fragment and route.", 2),
      phase("消息完整重组。", "三个片段全部按序到达，接收端显示完整消息。", "Message reassembled.", "All three fragments arrived in order and the receiver displays the complete message.", 3),
    ],
    note: t("1991 是万维网向外开放的重要时间入口；本场景用简化分片与选路说明网络传输，不把互联网与万维网等同，也不模拟 TCP 的真实实现。", "1991 is a milestone in opening the Web to others. Simplified fragmentation and routing illustrate networking without equating the Internet with the Web or implementing actual TCP."),
    source: "https://home.cern/science/computing/the-birth-of-the-web", next: "agents-2026",
  },
} satisfies Record<"flight" | "logic" | "space" | "network", World>;

for (const [zh, en] of [
  ["重心后移", "Move ballast aft"], ["重心前移", "Move ballast forward"], ["抬升舵面", "Raise elevator"], ["压低舵面", "Lower elevator"],
  ["先调整重心与升降舵，再试飞。", "Adjust ballast and elevator before a trial."], ["重心不在目标刻度，先移动配重。", "The center of gravity is off target. Move the ballast first."],
  ["机头偏低，增加升降舵。", "Nose too low. Increase the elevator setting."], ["机头偏高，减小升降舵。", "Nose too high. Reduce the elevator setting."],
  ["三段试飞完成，配平检验通过。", "Three flight legs complete. Trim checks passed."], ["本段通过，请按下一张配平卡调整。", "Leg passed. Adjust to the next trim card."],
  ["切换输入 A", "Toggle input A"], ["切换输入 B", "Toggle input B"], ["切换预测输出", "Toggle predicted output"],
  ["设置两个输入与预测输出，检验真值表。", "Set two inputs and the predicted output, then test the truth table."],
  ["输入与当前测试行不符，请对照测试卡。", "Inputs do not match this test row. Check the card."], ["输出预测错误：只有两个输入都为一，AND 才输出一。", "Incorrect prediction: AND returns one only when both inputs are one."],
  ["四行真值表检验通过。", "All four truth-table rows passed."], ["本行正确，继续设置下一组输入。", "Row passed. Set the next input pair."],
  ["向左平移", "Translate left"], ["向右平移", "Translate right"], ["升高舱体", "Translate up"], ["降低舱体", "Translate down"], ["向左偏航", "Yaw left"], ["向右偏航", "Yaw right"],
  ["尝试对接", "Attempt docking"], ["推进或对接", "Advance or dock"], ["先对正位置与姿态，再推进接近。", "Align position and attitude before advancing."], ["位置未对正，先把横向与高度归零。", "Position is misaligned. Zero the lateral and height readings."],
  ["姿态未对正，调整偏航使对接环平行。", "Attitude is misaligned. Adjust yaw until the docking rings are parallel."], ["软对接完成，三个接近检查点通过。", "Soft docking complete. Three approach checkpoints passed."],
  ["接近通过，微小扰动后请重新对正。", "Approach passed. Realign after the small disturbance."], ["选择下一分片", "Select next fragment"], ["切换传输路径", "Change route"],
  ["选择分片与可用路径，再发送。", "Choose a fragment and an available route, then send."], ["分片顺序错误，接收端仍在等待下一片。", "Fragment out of order. The receiver is still waiting for the next one."],
  ["当前路径断开，请选择另一条线路。", "This route is broken. Choose another link."], ["三个分片按序重组，消息完整送达。", "Three fragments reassembled in order. Message delivered."],
  ["分片已收到，请选择下一片与路径。", "Fragment received. Choose the next fragment and route."],
]) t(zh!, en!);
