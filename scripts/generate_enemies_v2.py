#!/usr/bin/env python3
"""
Generate 45 enemy sprites for NEO TOKYO: System Liberation (v2 - fixed prompts)
Fixed: removed "aura glow", "high contrast", "bold linework" that caused monochrome blue.
Added warm colors, explicit human anchoring, stronger anti-monochrome negative.
1024x1024 with transparent background via RMBG-2.0.
"""

import json
import urllib.request
import time
import random
import os

COMFYUI_URL = "http://127.0.0.1:8188"

STYLE = "solo, single character, anime character illustration, full body dynamic pose, white background, clean lines, anime game character style, dramatic confident stance, elaborate detailed clothing, vibrant saturated colors, colorful, warm lighting, varied color palette, natural skin tones, game character art, high quality, sharp details"

NEGATIVE = "dark, gritty, realistic, horror, scary, nude, nsfw, text, watermark, blurry, low quality, chibi, super deformed, multiple characters, multiple people, crowd, group, duo, blood, pokeball, pokeballs, poke ball, monochrome, silhouette, blue theme, black and blue, tron, neon glow, blue fire, energy aura, limited palette, desaturated, grayscale, lineart only, sketch, cat ears, animal ears, furry, non-human"

ENEMY_DESCRIPTIONS = {
    "angryCitizen": "1boy, furious middle-aged japanese man, veins popping on forehead, clenched fists, rumpled white dress shirt with loosened red tie, grey slacks, intimidating wide stance, red-faced with anger, fiery orange aura",
    "boredCivilServant": "1boy, utterly bored japanese government worker, half-lidded eyes, slouching posture, beige cardigan over white shirt, brown slacks, holding rubber stamp lazily, stack of yellow forms in other hand, dull grey aura",
    "busyHousewife": "1girl, energetic japanese housewife in constant motion, yellow apron over pink casual clothes, colorful shopping bags in both hands, red bicycle helmet still on, determined multitasking expression",
    "calmPharmacist": "1boy, serene japanese pharmacist, pristine white coat, wire-rimmed glasses, holding blue medicine bottle with practiced precision, gentle knowing smile, green cross emblem, medicinal herbs motif",
    "chattyOfficeLady": "1girl, animated japanese office lady mid-conversation, pink blouse under grey blazer, expressive hand gestures, red phone in one hand, brown coffee cup in other, sparkly social energy, gold accessories",
    "coldDoctor": "1boy, stern japanese doctor with serious demeanor, immaculate white coat with blue trim, silver stethoscope, clipboard held firmly, piercing eyes behind thin silver glasses, clinical professional stance",
    "coldReceptionist": "1girl, aloof japanese receptionist, perfect posture, navy tailored blazer over white blouse, polite but distant expression, manicured red nails, pearl earrings, professional demeanor, neat bun hairstyle",
    "complainerCustomer": "1boy, perpetually dissatisfied japanese customer, pointing finger accusingly, furrowed brow, green polo shirt and khaki pants, crumpled receipt in hand, red-faced with indignation",
    "confusedApplicant": "1boy, bewildered young japanese job applicant, oversized grey ill-fitting suit, clutching blue resume folder nervously, sweat drops, lost expression, yellow tie slightly crooked, first-interview anxiety visible",
    "confusedOldMan": "1boy, befuddled elderly japanese man, brown flat cap, thick round glasses, scratching head with one hand, holding colorful map upside down, beige cardigan with many pockets, endearing confused expression",
    "cryingChild": "1girl, teary-eyed japanese child about 8 years old, navy and white school uniform, oversized red backpack, holding broken yellow toy, sniffling with big watery eyes, scuffed shoes, dramatic anime cry face",
    "deliveryPerson": "1boy, swift japanese delivery worker, brown branded uniform cap and khaki jacket, carrying stack of cardboard packages, athletic stance ready to sprint, determination in eyes, green delivery tablet strapped to arm",
    "drunkGroup": "1boy, single tipsy japanese salaryman, loosened blue tie around forehead, rosy red cheeks, swaying stance, holding gold beer can, purple karaoke microphone in pocket, jolly warm expression, rumpled grey suit",
    "eagerNewEmployee": "1boy, overly enthusiastic new japanese employee, brand new crisp navy suit with visible price tag, yellow notebook and red pen ready, sparkling eager brown eyes, perfect bow posture, rookie energy radiating",
    "energeticManager": "1boy, high-energy japanese middle manager, white shirt with rolled-up sleeves, red tie, motivational pose with fist pump, silver whistle around neck, clipboard with colorful charts, infectious enthusiasm, slightly sweaty",
    "friendlyWaiter": "1boy, welcoming japanese waiter, crisp white shirt and black vest with gold buttons, white towel over arm, carrying silver tray with perfect balance, warm genuine smile, slight bow, brown hair neatly combed",
    "gymTeacher": "1boy, athletic japanese PE teacher, red and white track suit with whistle, muscular build, authoritative stance with arms crossed, orange sweatband, silver stopwatch around neck, motivational intensity",
    "indecisiveShopper": "1girl, paralyzed-by-choice japanese shopper, holding pink item in one hand and green item in other, overflowing orange shopping basket, furrowed brow of concentration, casual colorful outfit, question marks around head",
    "irritatedCustomer": "1girl, visibly annoyed japanese customer, tapping foot impatiently, checking gold watch pointedly, red shopping bag gripped tightly, purple blouse and white pants, thin-lipped expression of barely contained frustration",
    "itSupport": "1boy, exhausted japanese IT worker, white shirt with rolled sleeves, multiple devices on black belt, silver laptop under arm, green-tinted glasses reflecting code, orange energy drink in pocket, tired but capable expression",
    "kindGrandmother": "1girl, warm elderly japanese grandmother, purple and pink traditional clothing with modern touches, offering wrapped homemade food in furoshiki, gentle wrinkled smile, small stature, warm golden nurturing presence",
    "kindlyWindowStaff": "1girl, patient japanese municipal window clerk, light blue uniform blouse, neat navy skirt, stack of white forms organized perfectly, helpful pointing gesture, red reading glasses on chain, genuinely kind expression",
    "kindNurse": "1girl, compassionate japanese nurse, pastel pink scrubs with cute flower pins, medical clipboard, colorful band-aids in pocket, reassuring gentle expression, green healing motif, stethoscope with heart charm",
    "lostTourist": "1boy, bewildered foreign tourist in Tokyo, holding open red guidebook and blue phone map, silver camera around neck, loud hawaiian shirt, wide amazed eyes, wheeled suitcase with broken handle, sun hat",
    "loudDelinquent": "1boy, rebellious japanese yankii delinquent, modified black school uniform with long white coat, bleached blonde pompadour hair, intimidating slouch, aggressive stance, wooden sword as prop, red rising sun bandana",
    "neighborhoodKid": "1boy, mischievous japanese neighborhood kid about 12, yellow t-shirt and blue shorts with grass stains, orange bandaid on cheek, slingshot in back pocket, cheeky grin, adventurous pose, green sneakers",
    "nightShiftWorker": "1boy, bleary-eyed japanese convenience store night worker, green and white konbini uniform, dark circles under eyes, large brown coffee cup as lifeline, slightly drowsy but professional stance, name tag visible",
    "partTimerStudent": "1girl, multitasking japanese college student, half in orange work apron half in casual pink hoodie, textbook under arm, messy brown ponytail, youthful exhaustion, determination despite fatigue, colorful wristbands",
    "platformPusher": "1girl, professional japanese train platform attendant, white gloves, navy railway uniform with gold buttons and cap, pushing pose with outstretched arms, silver whistle ready, disciplined precise stance",
    "preciseStationStaff": "1boy, meticulous japanese station staff, perfectly pressed navy uniform with gold trim, pointing precisely at yellow schedule board, white gloves spotless, silver pocket watch, embodiment of punctuality",
    "pushySalesperson": "1boy, aggressive japanese salesperson, shiny grey business suit with red pocket square, leaning forward invading space, product sample thrust forward, dazzling forced smile, gold tie pin, sales desperation visible",
    "quietLibrarian": "1girl, reserved japanese librarian, lavender cardigan and long brown skirt, finger to lips in shush gesture, stack of colorful books balanced expertly, round reading glasses, peaceful bookish presence, pressed flower bookmark",
    "regularCustomer": "1boy, comfortable japanese regular customer at a cafe, casual olive jacket and jeans, brown loyalty card visible, relaxed knowing exactly what to order, warm sense of belonging, friendly wave gesture",
    "runningStudent": "1girl, late japanese student sprinting, navy and white sailor school uniform, toast in mouth, blue bag flapping, one shoe untied, motion blur lines, classic anime late-for-school energy, brown hair flying",
    "rushingOfficeWorker": "1boy, stressed japanese office worker in full sprint, navy suit jacket billowing, brown briefcase flying open with white papers, coffee sloshing from cup, phone pressed to ear, rush hour chaos energy",
    "schoolNurse": "1girl, gentle japanese school nurse, white medical coat over warm pink sweater, red first-aid kit in hand, silver thermometer ready, maternal concern expression, white curtain aesthetic, bandaid on finger, brown hair in bun",
    "silentChef": "1boy, intense japanese chef, traditional white chef coat with double buttons and tall white toque, arms crossed with gleaming knife in hand, stoic expression, flour-dusted, absolute kitchen authority, red flames behind",
    "sleepingManager": "1boy, drowsy japanese manager nodding off, navy wrinkled suit, head tilting to side, white papers as pillow on desk, cold brown coffee cup nearby, one eye barely open, grey tie askew, desk worker exhaustion",
    "stockingWorker": "1boy, diligent japanese store stocker, green work apron over white t-shirt, brown gloves, carrying cardboard box of colorful products, red scanning gun on hip, efficient stance, early-morning dedication, sneakers",
    "strictSectionChief": "1boy, intimidating japanese section chief kacho, perfect charcoal suit with white shirt and dark red tie, reading glasses for judging documents, red correction pen ready, disapproving evaluation stare, grey-templed hair",
    "studentCouncilPresident": "1girl, commanding japanese student council president, pristine navy school uniform with red armband, wooden pointer stick, imperious stance, honor student aura, rulebook in hand, natural born leader, long black hair",
    "tiredSalaryman": "1boy, utterly drained japanese salaryman, rumpled grey suit with loosened blue tie, dark circles visible, brown briefcase dragging on ground, thousand-yard stare, last-train-home energy, slightly swaying, disheveled black hair",
    "trainOtaku": "1boy, passionate japanese train enthusiast, olive vest covered in railway pins, silver camera with telephoto lens, colorful train schedule book, railway cap from collection, excited pointing gesture, round glasses, plump build",
    "veteranCashier": "1girl, seasoned japanese cashier, navy store uniform with name badge, hands positioned over invisible register, no-nonsense efficient expression, decades of experience in stance, short grey hair, reading glasses on chain",
    "worriedPatient": "1boy, anxious japanese hospital patient, light blue pajamas, clutching white appointment slip, thermometer in mouth, worried brow, green health insurance card ready, nervous fidgeting, messy brown hair, slippers",
}


def create_workflow(enemy_id, description):
    full_prompt = f"{STYLE}, {description}"

    workflow = {
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": "waiIllustriousSDXL_v160.safetensors"}
        },
        "2": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": full_prompt, "clip": ["1", 1]}
        },
        "3": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": NEGATIVE, "clip": ["1", 1]}
        },
        "4": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": 1024, "height": 1024, "batch_size": 1}
        },
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "seed": random.randint(1, 999999999),
                "steps": 30,
                "cfg": 7.5,
                "sampler_name": "dpmpp_2m",
                "scheduler": "karras",
                "denoise": 1.0,
                "model": ["1", 0],
                "positive": ["2", 0],
                "negative": ["3", 0],
                "latent_image": ["4", 0]
            }
        },
        "6": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["5", 0], "vae": ["1", 2]}
        },
        "7": {
            "class_type": "RMBG",
            "inputs": {
                "image": ["6", 0],
                "model": "RMBG-2.0",
                "sensitivity": 1.0,
                "process_res": 1024,
                "mask_blur": 0,
                "mask_offset": 0,
                "invert_output": False,
                "background": "Alpha"
            }
        },
        "8": {
            "class_type": "SaveImage",
            "inputs": {
                "images": ["7", 0],
                "filename_prefix": f"enemy_sprites_v2/{enemy_id}"
            }
        }
    }
    return workflow


def queue_prompt(workflow):
    data = json.dumps({"prompt": workflow}).encode("utf-8")
    req = urllib.request.Request(
        COMFYUI_URL + "/prompt",
        data=data,
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
            return result.get("prompt_id", "")
    except Exception as e:
        print(f"  Error queueing: {e}")
        return ""


def wait_for_completion(prompt_id, timeout=180):
    start = time.time()
    while time.time() - start < timeout:
        try:
            req = urllib.request.Request(COMFYUI_URL + "/history/" + prompt_id)
            with urllib.request.urlopen(req, timeout=10) as response:
                history = json.loads(response.read().decode("utf-8"))
                if prompt_id in history:
                    status = history[prompt_id].get("status", {})
                    if status.get("status_str") == "error":
                        msgs = status.get("messages", [])
                        print(f"  Error details: {msgs}")
                        return False
                    if history[prompt_id].get("outputs"):
                        return True
        except:
            pass
        time.sleep(2)
    return False


def main():
    os.makedirs(r"C:\Users\michi\ComfyUI\output\enemy_sprites_v2", exist_ok=True)

    total = len(ENEMY_DESCRIPTIONS)
    print("=" * 60)
    print(f"GENERATING {total} ENEMY SPRITES (v2 - color fixed)")
    print("1024x1024 colorful anime style with transparent backgrounds")
    print("=" * 60)

    success = 0
    failed = []

    for i, (enemy_id, desc) in enumerate(ENEMY_DESCRIPTIONS.items(), 1):
        print(f"\n[{i}/{total}] {enemy_id}")
        print(f"  {desc[:70]}...")

        workflow = create_workflow(enemy_id, desc)
        prompt_id = queue_prompt(workflow)

        if prompt_id:
            if wait_for_completion(prompt_id):
                print(f"  [OK]")
                success += 1
            else:
                print(f"  [FAILED]")
                failed.append(enemy_id)
        else:
            print(f"  [QUEUE ERROR]")
            failed.append(enemy_id)

        time.sleep(0.5)

    print("\n" + "=" * 60)
    print(f"COMPLETE: {success}/{total} enemy sprites generated")
    if failed:
        print(f"Failed: {', '.join(failed)}")
    print(f"Output: C:\\Users\\michi\\ComfyUI\\output\\enemy_sprites_v2\\")
    print("=" * 60)


if __name__ == "__main__":
    main()
