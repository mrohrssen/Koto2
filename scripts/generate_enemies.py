#!/usr/bin/env python3
"""
Generate 48 enemy sprites for NEO TOKYO: System Liberation
Pokemon NPC trainer style - Tokyo citizens with enhanced character descriptions.
1024x1024 with transparent background via RMBG-2.0.

Run on Windows PC with ComfyUI at http://127.0.0.1:8188
Output: ComfyUI/output/enemy_sprites/{camelCaseName}_00001_.png
"""

import json
import urllib.request
import time
import random
import os

COMFYUI_URL = "http://127.0.0.1:8188"

STYLE = "solo, single character, anime character illustration, full body dynamic pose, white background, clean lines, anime game rival character style, dramatic confident stance, elaborate detailed clothing, slight aura glow, imposing presence, vibrant colors, game character art, high quality, sharp details, bold linework, high contrast"

NEGATIVE = "dark, gritty, realistic, horror, scary, nude, nsfw, text, watermark, blurry, low quality, chibi, super deformed, multiple characters, multiple people, crowd, group, duo, blood, plain clothing, pokeball, pokeballs, poke ball"

ENEMY_DESCRIPTIONS = {
    "angryCitizen": "furious middle-aged japanese man, veins popping on forehead, clenched fists, rumpled dress shirt with loosened tie, intimidating wide stance, red-faced with anger, steam practically visible",
    "boredCivilServant": "utterly bored japanese government worker, half-lidded eyes, slouching posture, beige cardigan over white shirt, holding rubber stamp lazily, stack of forms in other hand, soul-crushingly mundane aura",
    "busyHousewife": "energetic japanese housewife in constant motion, apron over casual clothes, shopping bags in both hands, bicycle helmet still on, determined multitasking expression, organized chaos",
    "calmPharmacist": "serene japanese pharmacist, pristine white coat, wire-rimmed glasses, holding medicine bottle with practiced precision, gentle knowing smile, calming green aura, medicinal herbs motif",
    "chattyOfficeLady": "animated japanese office lady mid-conversation, stylish business casual, expressive hand gestures, phone in one hand, coffee in other, sparkly social butterfly energy, trendy accessories",
    "coldDoctor": "stern japanese doctor with icy demeanor, immaculate white coat, stethoscope, clipboard held like a shield, piercing analytical eyes behind thin glasses, clinical cold blue aura",
    "coldReceptionist": "aloof japanese receptionist, perfect posture behind invisible desk, tailored blazer, polite but distant smile that doesn't reach eyes, manicured nails, icy professional demeanor",
    "complainerCustomer": "perpetually dissatisfied japanese customer, pointing finger accusingly, furrowed brow, casual weekend clothes, receipt crumpled in hand, aura of righteous consumer indignation",
    "confusedApplicant": "bewildered young japanese job applicant, oversized ill-fitting suit, clutching resume folder nervously, sweat drops, lost expression, tie slightly crooked, first-interview anxiety visible",
    "confusedOldMan": "befuddled elderly japanese man, flat cap, thick glasses, scratching head with one hand, holding map upside down, cardigan with too many pockets, endearing confused expression",
    "cryingChild": "teary-eyed japanese child about 8 years old, school uniform, backpack too big, holding broken toy, sniffling with big watery eyes, scuffed shoes, dramatic anime cry face",
    "deliveryPerson": "swift japanese delivery worker, branded uniform cap and jacket, carrying stack of packages, athletic stance ready to sprint, determination in eyes, delivery tablet strapped to arm",
    "drunkGroup": "single tipsy japanese salaryman representing a group, loosened tie around forehead, rosy cheeks, swaying stance, holding beer can, karaoke microphone in pocket, jolly inebriated glow",
    "eagerNewEmployee": "overly enthusiastic new japanese employee, brand new crisp suit still with tags showing, notebook and pen ready, sparkling eager eyes, perfect bow posture, rookie energy radiating",
    "energeticManager": "high-energy japanese middle manager, rolled-up sleeves, motivational pose with fist pump, whistle around neck, clipboard with charts, infectious enthusiasm aura, slightly sweaty",
    "friendlyWaiter": "welcoming japanese waiter, crisp white shirt and black vest, towel over arm, carrying invisible tray with perfect balance, warm genuine smile, slight bow, hospitality aura",
    "gymTeacher": "athletic japanese PE teacher, track suit with whistle, muscular build, authoritative stance with arms crossed, sweatband, stopwatch around neck, motivational intensity",
    "indecisiveShopper": "paralyzed-by-choice japanese shopper, holding two items comparing them, shopping basket overflowing, furrowed brow of concentration, surrounded by floating question marks",
    "irritatedCustomer": "visibly annoyed japanese customer, tapping foot impatiently, checking watch pointedly, shopping bag gripped tightly, thin-lipped expression of barely contained frustration",
    "itSupport": "exhausted japanese IT worker, multiple devices strapped to belt, laptop under arm, glasses reflecting screen code, energy drink in pocket, cable spaghetti aura, tired but capable",
    "kindGrandmother": "warm elderly japanese grandmother, traditional clothing with modern touches, offering wrapped homemade food, gentle wrinkled smile, small stature but powerful nurturing presence",
    "kindlyWindowStaff": "patient japanese municipal window clerk, neat uniform, stack of forms organized perfectly, helpful pointing gesture, reading glasses on chain, bureaucratic but genuinely kind",
    "kindNurse": "compassionate japanese nurse, pastel scrubs with cute pins, medical clipboard, band-aids in pocket, reassuring gentle expression, healing green aura, stethoscope like jewelry",
    "lostTourist": "bewildered foreign tourist in Tokyo, guidebook and phone map both out, camera around neck, inappropriate outfit for weather, wide amazed eyes, luggage wheel broken",
    "loudDelinquent": "rebellious japanese yankii delinquent, modified school uniform with long coat, bleached pompadour hair, intimidating slouch, loud aggressive stance, bat or umbrella as prop",
    "neighborhoodKid": "mischievous japanese neighborhood kid about 12, casual clothes with grass stains, bandaid on cheek, slingshot in back pocket, cheeky grin, adventurous pose, bicycle nearby",
    "nightShiftWorker": "bleary-eyed japanese convenience store night worker, konbini uniform, dark circles under eyes, coffee cup as lifeline, slightly zombified but professional stance, fluorescent-lit pallor",
    "partTimerStudent": "multitasking japanese college student, half in work uniform half in casual clothes, textbook under arm, part-time job apron, youthful exhaustion, determination despite fatigue",
    "platformPusher": "professional japanese train platform attendant, white gloves, railway uniform and cap, pushing pose with outstretched arms, whistle ready, disciplined military-like precision",
    "preciseStationStaff": "meticulous japanese station staff, perfectly pressed uniform, pointing precisely at schedule board, white gloves spotless, pocket watch, embodiment of japanese punctuality",
    "pushySalesperson": "aggressive japanese salesperson, business suit slightly too shiny, leaning forward invading space, product sample thrust forward, dazzling forced smile, sales quota desperation aura",
    "quietLibrarian": "reserved japanese librarian, cardigan and long skirt, finger to lips in shush gesture, stack of books balanced expertly, reading glasses, peaceful bookish aura, pressed flower bookmark",
    "regularCustomer": "comfortable japanese regular customer, casual familiar clothes, loyalty card visible, relaxed knowing exactly what to order pose, sense of belonging, favorite seat aura",
    "runningStudent": "late japanese student sprinting, school uniform disheveled, toast in mouth, bag flapping, one shoe untied, motion blur lines, classic anime late-for-school energy",
    "rushingOfficeWorker": "stressed japanese office worker in full sprint, briefcase flying open with papers, coffee sloshing, phone pressed to ear, suit jacket billowing, big-city rush hour chaos",
    "schoolNurse": "gentle japanese school nurse, white coat over warm clothes, first-aid kit, thermometer ready, maternal concern expression, infirmary curtain aesthetic, band-aid dispenser",
    "silentChef": "intense japanese chef, traditional white chef coat and tall toque, arms crossed with knife in hand, stoic expression, flour-dusted, absolute kitchen authority, flame aura",
    "sleepingManager": "narcoleptic japanese manager, suit slightly wrinkled, head nodding off, papers as pillow, coffee gone cold, one eye barely open, desk worker exhaustion personified",
    "stockingWorker": "diligent japanese store stocker, work apron and gloves, carrying box of products, scanning gun on hip, efficient mechanical movements, early-morning dedication",
    "strictSectionChief": "intimidating japanese section chief kacho, perfect suit and posture, reading glasses for judging documents, red correction pen ready, disapproving evaluation stare, authority aura",
    "studentCouncilPresident": "commanding japanese student council president, pristine school uniform with armband, pointer stick, imperious stance, honor student aura, rulebook in hand, natural born leader",
    "tiredSalaryman": "utterly drained japanese salaryman, rumpled suit with loosened tie, dark circles like bruises, briefcase dragging on ground, 1000-yard stare, last-train-home energy, slightly swaying",
    "trainOtaku": "passionate japanese train enthusiast, camera with telephoto lens, train schedule book, railway cap from collection, excited pointing at invisible train, surrounded by train model aura",
    "veteranCashier": "seasoned japanese cashier, store uniform worn with expertise, hands moving in blur over register, no-nonsense efficient expression, decades of experience in stance, speed scanning aura",
    "worriedPatient": "anxious japanese hospital patient, pajamas or casual clothes, clutching appointment slip, thermometer in mouth, worried brow, health insurance card ready, nervous fidgeting",
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
                "filename_prefix": f"enemy_sprites/{enemy_id}"
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
    os.makedirs(r"C:\Users\michi\ComfyUI\output\enemy_sprites", exist_ok=True)

    total = len(ENEMY_DESCRIPTIONS)
    print("=" * 60)
    print(f"GENERATING {total} ENEMY SPRITES")
    print("1024x1024 Pokemon NPC style with transparent backgrounds")
    print("=" * 60)

    success = 0
    failed = []

    for i, (enemy_id, desc) in enumerate(ENEMY_DESCRIPTIONS.items(), 1):
        print(f"\n[{i}/{total}] {enemy_id}")
        print(f"  {desc[:60]}...")

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
    print(f"Output: C:\\Users\\michi\\ComfyUI\\output\\enemy_sprites\\")
    print("=" * 60)


if __name__ == "__main__":
    main()
